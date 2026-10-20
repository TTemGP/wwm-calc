import type { EditorTimelineResult } from "./editorTimeline"
import type {
  RotationSimulationBaseline,
  RotationSimulationBundle,
  RotationActionBreakdown,
} from "./rotationCalculator"
import type { RotationMetrics } from "./rotationMetrics"
import type { TimelineRow } from "./rotationTimeline"

/**
 * Transport for the calculation worker pool. Dispatch decisions, result caching and
 * cancellation policy belong to the calculation store; this module only owns worker
 * lifetime, queueing and message translation, so nothing outside it talks to a worker.
 */

/**
 * The numbers a run is compared by. A reading carries no timeline, because nothing that
 * asks for one goes on to read it: a graduated preset is only ever weighed against another,
 * and a build is only ever weighed against the active one.
 */
export type ThroughputReading = { dps: number; hps: number; totalDamage: number }

export type TransportMode = "editorTimeline" | "baseline" | "comparisons" | "throughput"
export type TransportResult =
  | EditorTimelineResult
  | ThroughputReading
  | RotationSimulationBaseline
  | { metrics: RotationMetrics }

export type TransportTiming = {
  /** Time spent waiting for a free worker before the job started. */
  queueMs: number
  /** Time the job spent running on a worker. */
  workerMs: number
}

export type TransportRequest = {
  mode: TransportMode
  bundle: RotationSimulationBundle
  /** Stable identity of the work, used to replace a queued duplicate. */
  key: string
  /** Identifies the baseline the worker caches, for modes that build on one. */
  cacheKey?: string
  /** Supplied to a worker that does not hold the baseline itself. */
  baseline?: RotationSimulationBaseline
  priority?: number
  onProgress?: (progress: number) => void
  /** Reports how long the job waited for a worker and then ran on one. */
  onTiming?: (timing: TransportTiming) => void
}

type QueuedRequest = TransportRequest & {
  sequence: number
  retryCount: number
  queuedAt: number
  /** Set when a worker picks the job up, which separates waiting from running. */
  dispatchedAt?: number
  resolve: (r: TransportResult) => void
  reject: (e: Error) => void
}

function currentTime() {
  return performance.now()
}

/** Report one job's wait and run times, and tolerate a caller that only wants one. */
function reportTiming(request: QueuedRequest) {
  if (!request.onTiming) return
  const dispatchedAt = request.dispatchedAt ?? request.queuedAt
  const finishedAt = currentTime()
  request.onTiming({ queueMs: dispatchedAt - request.queuedAt, workerMs: finishedAt - dispatchedAt })
}

type WorkerResultMessage = {
  id: number
  metrics?: RotationMetrics
  editorTimeline?: EditorTimelineResult
  throughput?: ThroughputReading
  timeline?: TimelineRow[]
  anchorTime?: number
  duration?: number
  actionBreakdowns?: Record<string, RotationActionBreakdown>
  baseline?: RotationSimulationBaseline["baseline"]
  compactedInnerWayResults?: boolean
  expectedOutcomeBuffSchedule?: RotationSimulationBaseline["expectedOutcomeBuffSchedule"]
  mysticVitalityDamageScale?: number
  progress?: number
  error?: string
}

/**
 * A slot mirrors the baseline cache its worker keeps for itself. A `comparisons`
 * request reads `baselineCache` inside the worker and throws when the key is
 * absent, so the key set has to be per slot: one shared set would let a job land
 * on a slot that never ran the baseline and suppress the caller-supplied fallback.
 */
type WorkerSlot = {
  worker: Worker
  running?: { id: number; request: QueuedRequest }
  baselineKeys: Set<string>
  idleSince: number
}

const maxWorkers = 4
let slots: WorkerSlot[] = []
let requestId = 0
let requestSequence = 0
let pending: QueuedRequest[] = []
let idleCounter = 0

function workerBudget() {
  const cores = typeof navigator === "undefined" ? 2 : (navigator.hardwareConcurrency ?? 2)
  return Math.max(1, Math.min(maxWorkers, cores - 1))
}

/**
 * Tear down every worker, rejecting whatever each one was running plus the queue.
 * Interrupted requests are collected before the slots are cleared, otherwise the
 * rejections find nothing left to settle and the callers hang forever.
 */
function teardownSlots(message: string) {
  const error = new Error(message)
  const interrupted = slots.flatMap(slot => (slot.running ? [slot.running.request] : []))
  const doomed = slots
  const queued = pending
  slots = []
  pending = []
  doomed.forEach(slot => {
    slot.worker.terminate()
    slot.running = undefined
  })
  for (const request of [...interrupted, ...queued]) {
    reportTiming(request)
    request.reject(error)
  }
}

function removeSlot(slot: WorkerSlot) {
  const index = slots.indexOf(slot)
  if (index < 0) return false
  slots.splice(index, 1)
  slot.worker.terminate()
  return true
}

function requeueOrReject(request: QueuedRequest, error: Error) {
  if (request.retryCount < 1) pending.push({ ...request, retryCount: request.retryCount + 1 })
  else request.reject(error)
}

/** Prefer a slot that already cached the requested baseline over cloning it again. */
function pickSlot(request: QueuedRequest) {
  const free = slots.filter(slot => !slot.running)
  if (request.cacheKey) {
    const holding = free.find(slot => slot.baselineKeys.has(request.cacheKey!))
    if (holding) return holding
  }
  return free.reduce((oldest, slot) => (slot.idleSince < oldest.idleSince ? slot : oldest))
}

function translateResult(request: QueuedRequest, message: WorkerResultMessage): TransportResult {
  if (message.error) throw new Error(message.error)
  if (message.editorTimeline) return message.editorTimeline
  if (message.throughput) return message.throughput
  if (!message.metrics) throw new Error("Rotation calculation worker returned no result")
  if (request.mode !== "baseline") return { metrics: message.metrics }
  return {
    metrics: message.metrics,
    timeline: message.timeline ?? [],
    anchorTime: message.anchorTime ?? 0,
    duration: message.duration ?? 0,
    actionBreakdowns: message.actionBreakdowns ?? {},
    ...(message.baseline ? { baseline: message.baseline } : {}),
    ...(message.compactedInnerWayResults ? { compactedInnerWayResults: true } : {}),
    ...(message.expectedOutcomeBuffSchedule
      ? { expectedOutcomeBuffSchedule: message.expectedOutcomeBuffSchedule }
      : {}),
    ...(message.mysticVitalityDamageScale !== undefined
      ? { mysticVitalityDamageScale: message.mysticVitalityDamageScale }
      : {}),
  } as RotationSimulationBaseline
}
function settleSlotFailure(slot: WorkerSlot, message: string, cause?: unknown) {
  if (!removeSlot(slot)) return
  const interrupted = slot.running?.request
  slot.running = undefined
  if (interrupted) requeueOrReject(interrupted, cause instanceof Error ? cause : new Error(message))
  dispatchPending()
}

function createSlot(): WorkerSlot {
  const slot: WorkerSlot = { worker: undefined as unknown as Worker, baselineKeys: new Set(), idleSince: 0 }
  const createdWorker = new Worker(new URL("./rotationWorker.ts", import.meta.url), { type: "module" })
  slot.worker = createdWorker

  createdWorker.addEventListener("message", (event: MessageEvent<WorkerResultMessage>) => {
    if (slots.indexOf(slot) < 0) return
    const running = slot.running
    if (!running || event.data.id !== running.id) return
    if (typeof event.data.progress === "number") {
      running.request.onProgress?.(event.data.progress)
      return
    }
    const completed = running.request
    slot.running = undefined
    slot.idleSince = ++idleCounter
    if (completed.cacheKey && (completed.mode === "baseline" || completed.baseline)) {
      slot.baselineKeys.add(completed.cacheKey)
    }
    try {
      const result = translateResult(completed, event.data)
      reportTiming(completed)
      completed.resolve(result)
    } catch (error) {
      reportTiming(completed)
      completed.reject(error instanceof Error ? error : new Error("Rotation calculation failed"))
    }
    dispatchPending()
  })

  createdWorker.addEventListener("error", event => {
    settleSlotFailure(slot, event.message || "Rotation calculation worker failed")
  })
  createdWorker.addEventListener("messageerror", () => {
    settleSlotFailure(slot, "Rotation calculation worker returned an unreadable result")
  })

  slots.push(slot)
  return slot
}

function dispatchTo(slot: WorkerSlot, request: QueuedRequest) {
  const id = ++requestId
  request.dispatchedAt = currentTime()
  slot.running = { id, request }
  try {
    slot.worker.postMessage({
      id,
      bundle: request.bundle,
      mode: request.mode,
      cacheKey: request.cacheKey,
      ...(!request.cacheKey || slot.baselineKeys.has(request.cacheKey) ? {} : { baseline: request.baseline }),
    })
  } catch (error) {
    slot.running = undefined
    removeSlot(slot)
    reportTiming(request)
    requeueOrReject(request, error instanceof Error ? error : new Error("Rotation calculation worker failed"))
  }
}

function dispatchPending() {
  pending.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.sequence - right.sequence)
  while (pending.length > 0) {
    let free = slots.filter(slot => !slot.running)
    if (free.length === 0) {
      if (slots.length >= workerBudget()) return
      free = [createSlot()]
    }
    const next = pending.shift()!
    dispatchTo(pickSlot(next) ?? free[0], next)
  }
}

/**
 * Queue a request, replacing any queued work with the same key. The key names a
 * piece of work, so re-issuing it discards the older attempt rather than waiting
 * behind it; callers that want to keep the earlier result must not reuse the key.
 */
export function dispatchCalculation(request: TransportRequest) {
  return new Promise<TransportResult>((resolve, reject) => {
    const queued: QueuedRequest = {
      ...request,
      priority: request.priority ?? 0,
      sequence: ++requestSequence,
      retryCount: 0,
      queuedAt: currentTime(),
      resolve,
      reject,
    }
    const replacedIndex = pending.findIndex(candidate => candidate.key === queued.key)
    if (replacedIndex >= 0) {
      // Never dispatched, so all of its elapsed time was queue wait.
      reportTiming(pending[replacedIndex])
      pending[replacedIndex].reject(new Error("Calculation superseded by a newer request"))
      pending.splice(replacedIndex, 1)
    }
    pending.push(queued)
    dispatchPending()
  })
}

/** Stop the active batch so its replacement starts without stale queued work or worker cache. */
export function supersedeCalculations() {
  // Idle workers hold no stale requests; keeping them preserves their prepared editor timeline.
  if (pending.length === 0 && slots.every(slot => !slot.running)) return
  teardownSlots("Calculation superseded by a newer batch")
}

export function disposeCalculationWorkers() {
  teardownSlots("Calculation worker disposed")
}

/** Drop queued work with this key, and abandon it if a worker is already running it. */
export function cancelCalculation(key: string, message = "Calculation superseded by a newer revision") {
  const error = new Error(message)
  pending = pending.filter(request => {
    if (request.key !== key) return true
    request.reject(error)
    return false
  })
  const interrupted = slots.find(slot => slot.running?.request.key === key)
  if (interrupted) {
    const request = interrupted.running!.request
    removeSlot(interrupted)
    reportTiming(request)
    request.reject(error)
  }
  dispatchPending()
}
