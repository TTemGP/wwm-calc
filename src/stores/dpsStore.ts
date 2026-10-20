import { create } from "zustand"

import type { EditorTimelineResult } from "@/calculations/editorTimeline"
import type { RotationSimulationBaseline, RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { RotationMetrics } from "@/calculations/rotationMetrics"
import {
  cancelCalculation,
  dispatchCalculation,
  disposeCalculationWorkers,
  supersedeCalculations,
  type ThroughputReading,
  type TransportResult,
} from "@/calculations/rotationWorkerTransport"

import { recordFetch, reportDpsCache } from "./dpsStoreDiagnostics"

function currentTime() {
  return performance.now()
}

/**
 * The single entry point for calculation work, so the worker pool is reached from one place and
 * a given calculation runs once however many callers ask for it.
 */

export type DpsResults = {
  editorTimeline: EditorTimelineResult
  baseline: RotationSimulationBaseline
  comparisons: { metrics: RotationMetrics }
  throughput: ThroughputReading
}
export type DpsKind = keyof DpsResults

/** How a request was served, which is what distinguishes a fast path from a slow one. */
export type DpsSource = "held" | "joined" | "dispatched" | "failed"

export type DpsFetchTiming = {
  kind: DpsKind
  source: DpsSource
  /** Total time the caller waited. */
  totalMs: number
  /** Time spent waiting for a free worker. */
  queueMs: number
  /** Time the job spent running on a worker. */
  workerMs: number
  /** Time to turn the request into a bundle, which a held result never pays. */
  buildMs: number
}

export type DpsEntry<Result = unknown> = {
  cacheKey: string
  kind: DpsKind
  status: "pending" | "ready" | "failed"
  progress: number
  result?: Result
  error?: string
}

export type DpsRequest<K extends DpsKind> = {
  kind: K
  /**
   * Identity of the calculation. Requests of the same kind sharing a cache key share one
   * worker job, and two different kinds may choose the same string without colliding: the
   * store keys its results by kind as well.
   */
  cacheKey: string
  /** Builds the worker bundle, and runs only when the result is not already held. */
  build: () => RotationSimulationBundle
  priority?: number
  onProgress?: (progress: number) => void
  /** Comparisons resolve against a baseline rather than calculating from scratch. */
  baseline?: () => RotationSimulationBaseline
}

/**
 * How many finished results of each kind are held. The sizes differ by orders of magnitude
 * because the kinds differ in size and in how many of them a session actually has: one baseline
 * at rest and one more per rotation activated, a couple of readings at rest and a couple more per
 * rotation visited, and hundreds of comparisons to a single rotation. An editor timeline is a
 * preview of one revision with a key per request, so holding one is never right.
 *
 * `doc/system-architecture.md` records the working set these were measured against.
 */
const retentionByKind: Record<DpsKind, number> = { editorTimeline: 0, baseline: 4, comparisons: 4096, throughput: 64 }

const isRetained = (kind: DpsKind) => retentionByKind[kind] > 0

/**
 * The identity a result is stored and looked up under.
 *
 * A caller's key identifies a calculation to that caller, and two callers can choose the same
 * string for work of different shapes — a graduated preset and a build are both fingerprinted
 * bundles, so they genuinely collide. The kind is therefore part of the identity.
 */
function entryKey(kind: DpsKind, cacheKey: string) {
  return `${kind}:${cacheKey}`
}

/** In-flight work, kept outside the store so its state stays serialisable. */
const inFlight = new Map<string, Promise<TransportResult>>()

/**
 * Bumped when a batch is superseded. A request outlives the batch that started it when the
 * workers are torn down underneath it, and its rejection would otherwise land on whatever now
 * holds the same key, marking a live request failed.
 */
let generation = 0

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Map order is insertion order, so the first ready entry of a kind is the oldest. */
function evictOverflow(entries: Map<string, DpsEntry>, kind: DpsKind) {
  const limit = retentionByKind[kind]
  const retained = [...entries].filter(([, entry]) => entry.kind === kind && entry.status === "ready")
  for (let index = 0; retained.length - index > limit; index += 1) entries.delete(retained[index][0])
}

export type DpsStore = {
  entries: ReadonlyMap<string, DpsEntry>
  ensure: <K extends DpsKind>(request: DpsRequest<K>) => Promise<DpsResults[K]>
  /** The held record for a calculation, including its status, without scheduling anything. */
  entry: (kind: DpsKind, cacheKey: string) => DpsEntry | undefined
  /** The held result for a calculation, without scheduling anything. */
  peek: <K extends DpsKind>(kind: K, cacheKey: DpsRequest<K>["cacheKey"]) => DpsResults[K] | undefined
  supersede: () => void
  cancel: (kind: DpsKind, cacheKey: string) => void
  /** Forget every cached calculation, in the store and in every worker. */
  reset: () => void
}

type StoreAccessors = {
  set: (partial: Partial<DpsStore> | ((state: DpsStore) => Partial<DpsStore>)) => void
  get: () => DpsStore
}

/** Where a dispatch spent its time, filled in by the transport while the job runs. */
type DispatchTimings = { buildMs: number; queueMs: number; workerMs: number }

/** A request answered without reaching a worker spends no time in one. */
const noWorkerTimings = { queueMs: 0, workerMs: 0, buildMs: 0 }

/** One dispatched request, and the bookkeeping that decides whether its outcome still counts. */
type RequestRun<K extends DpsKind> = {
  set: StoreAccessors["set"]
  request: DpsRequest<K>
  key: string
  startedAt: number
  requestedAt: number
  timings: DispatchTimings
}

/** Re-insert so a refreshed entry counts as newest rather than becoming the next eviction. */
function put(set: StoreAccessors["set"], entry: DpsEntry) {
  set(state => {
    const entries = new Map(state.entries)
    const key = entryKey(entry.kind, entry.cacheKey)
    entries.delete(key)
    entries.set(key, entry)
    if (entry.status === "ready") evictOverflow(entries, entry.kind)
    reportDpsCache(entries, retentionByKind)
    return { entries }
  })
}

/**
 * Hands the job to the transport.
 *
 * The bundle is built here rather than by the caller so a held result costs neither a bundle nor
 * a worker, and so `buildMs` measures only the callers who actually reach a worker.
 */
function startDispatch<K extends DpsKind>({ set, request, key, startedAt, timings }: RequestRun<K>) {
  const buildStartedAt = currentTime()
  const bundle = request.build()
  timings.buildMs = currentTime() - buildStartedAt
  return dispatchCalculation({
    mode: request.kind,
    bundle,
    key,
    // A reading is routed by the baseline cache when it names one, because a worker holding that
    // baseline already has the answer and needs to run nothing. Only an editor timeline is
    // dispatched without a key to look up, since no baseline cache holds one.
    cacheKey: request.kind === "editorTimeline" ? undefined : request.cacheKey,
    baseline: request.baseline?.(),
    priority: request.priority,
    onTiming: timing => {
      timings.queueMs = timing.queueMs
      timings.workerMs = timing.workerMs
    },
    onProgress: progress => {
      request.onProgress?.(progress)
      if (generation !== startedAt) return
      set(state => {
        const current = state.entries.get(key)
        if (current?.status !== "pending") return state
        return { entries: new Map([...state.entries, [key, { ...current, progress }]]) }
      })
    },
  })
}

/** A request already running for this identity, which the caller waits on instead of redoing. */
async function joinRunning<K extends DpsKind>(
  running: Promise<TransportResult>,
  request: DpsRequest<K>,
  requestedAt: number,
) {
  try {
    const joined = (await running) as DpsResults[K]
    recordFetch({ kind: request.kind, source: "joined", totalMs: currentTime() - requestedAt, ...noWorkerTimings })
    return joined
  } catch (error) {
    recordFetch({ kind: request.kind, source: "failed", totalMs: currentTime() - requestedAt, ...noWorkerTimings })
    throw error
  }
}

async function ensureRequest<K extends DpsKind>(
  { set, get }: StoreAccessors,
  request: DpsRequest<K>,
): Promise<DpsResults[K]> {
  const { cacheKey, kind } = request
  const key = entryKey(kind, cacheKey)
  const requestedAt = currentTime()
  const running = inFlight.get(key)
  if (running) return await joinRunning(running, request, requestedAt)

  const startedAt = generation
  const held = get().entries.get(key)
  // Served without building a bundle or touching a worker, which is the point of holding a result.
  if (isRetained(kind) && held?.status === "ready") {
    recordFetch({ kind, source: "held", totalMs: currentTime() - requestedAt, ...noWorkerTimings })
    return held.result as DpsResults[K]
  }
  if (isRetained(kind)) put(set, { cacheKey, kind, status: "pending", progress: 0 })

  const run: RequestRun<K> = { set, request, key, startedAt, requestedAt, timings: { ...noWorkerTimings } }
  const job = startDispatch(run)
  inFlight.set(key, job)
  return await settleRun(run, job)
}

/** Only the batch that started a request may record its outcome. */
async function settleRun<K extends DpsKind>(run: RequestRun<K>, job: Promise<TransportResult>) {
  const { set, request, key, startedAt, requestedAt, timings } = run
  const { cacheKey, kind } = request
  try {
    const result = (await job) as DpsResults[K]
    if (generation === startedAt && isRetained(kind)) put(set, { cacheKey, kind, status: "ready", progress: 1, result })
    recordFetch({ kind, source: "dispatched", totalMs: currentTime() - requestedAt, ...timings })
    return result
  } catch (error) {
    if (generation === startedAt && isRetained(kind))
      put(set, { cacheKey, kind, status: "failed", progress: 1, error: errorMessage(error) })
    recordFetch({ kind, source: "failed", totalMs: currentTime() - requestedAt, ...timings })
    throw error
  } finally {
    if (inFlight.get(key) === job) inFlight.delete(key)
  }
}

export const useDpsStore = create<DpsStore>()((set, get) => ({
  entries: new Map(),

  entry: (kind, cacheKey) => get().entries.get(entryKey(kind, cacheKey)),

  peek: (kind, cacheKey) => get().entries.get(entryKey(kind, cacheKey))?.result as never,

  ensure: request => ensureRequest({ set, get }, request),

  supersede: () => {
    generation += 1
    inFlight.clear()
    // Held results stay valid across a supersede; only in-flight bookkeeping does not.
    set(state => {
      const entries = new Map([...state.entries].filter(([, entry]) => entry.status === "ready"))
      reportDpsCache(entries, retentionByKind)
      return { entries }
    })
    supersedeCalculations()
  },

  cancel: (kind, cacheKey) => cancelCalculation(entryKey(kind, cacheKey)),

  reset: () => {
    inFlight.clear()
    // A worker's baseline and editor-timeline caches live inside the worker, so the only way to
    // forget them is to terminate it. Any request in flight is rejected, which is the same signal
    // a supersession gives its caller.
    disposeCalculationWorkers()
    const entries = new Map<string, DpsEntry>()
    reportDpsCache(entries, retentionByKind)
    set({ entries })
  },
}))
