import type { DpsEntry, DpsFetchTiming, DpsKind } from "./dpsStore"

/**
 * Cache occupancy reporting for local development. The store has no other observer, so
 * without this the only way to see whether a calculation was reused or recomputed is to
 * instrument it. A fan-out writes many entries in quick succession, so reports are
 * coalesced and an unchanged summary is not reprinted.
 */
const enabled = import.meta.env.DEV && import.meta.env.MODE !== "test"

const reportDelayMs = 250
let pending: ReturnType<typeof setTimeout> | undefined
let latest: { entries: ReadonlyMap<string, DpsEntry>; retention: Record<DpsKind, number> } | undefined
let lastSummary = ""

type KindSummary = { kind: DpsKind; ready: number; pending: number; failed: number; limit: number; bytes: number }

/**
 * Serialized size of a held result, measured once per result object. A result is never
 * mutated once stored, so identity is a sufficient key, and a fan-out measures each
 * baseline once rather than re-serializing the whole cache on every report.
 */
const measured = new WeakMap<object, number>()

function resultBytes(result: unknown) {
  if (result === undefined) return 0
  if (typeof result !== "object" || result === null) return 8
  const known = measured.get(result)
  if (known !== undefined) return known
  let bytes = 0
  try {
    bytes = JSON.stringify(result)?.length ?? 0
  } catch {
    // A cycle or a non-serialisable value would otherwise stall the report; the cache
    // key is produced the same way, so nothing held here is expected to hit this.
    bytes = 0
  }
  measured.set(result, bytes)
  return bytes
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function summarize(entries: ReadonlyMap<string, DpsEntry>, retention: Record<DpsKind, number>) {
  const rows: KindSummary[] = []
  for (const kind of Object.keys(retention) as DpsKind[]) {
    rows.push({ kind, ready: 0, pending: 0, failed: 0, limit: retention[kind], bytes: 0 })
  }
  const byKind = new Map(rows.map(row => [row.kind, row]))
  for (const entry of entries.values()) {
    const row = byKind.get(entry.kind)
    if (!row) continue
    if (entry.status === "ready") {
      row.ready += 1
      row.bytes += resultBytes(entry.result)
    } else if (entry.status === "pending") row.pending += 1
    else row.failed += 1
  }
  return rows
}

function render(rows: KindSummary[], total: number) {
  const held = rows.filter(row => row.limit > 0)
  const body = held.map(row => `${row.kind} ${row.ready}/${row.limit}`).join("  ")
  const inflight = rows.flatMap(row => (row.pending > 0 ? [`${row.kind} pending ${row.pending}`] : []))
  const bytes = rows.reduce((sum, row) => sum + row.bytes, 0)
  return [`total ${total}`, body, `serialized ${formatBytes(bytes)}`, ...inflight].filter(Boolean).join("  |  ")
}

/** Enough recent fetches to see a sweep's shape without the console becoming the bottleneck. */
const recentLimit = 24
const recent: DpsFetchTiming[] = []

/**
 * Record how one request was served. Kept outside the store's state so timing never
 * triggers a re-render, and so the numbers reflect the calls the application made
 * rather than the entries that happen to survive.
 */
export function recordFetch(timing: DpsFetchTiming) {
  if (!enabled) return
  recent.push(timing)
  if (recent.length > recentLimit) recent.shift()
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function fetchRows() {
  return recent.map(entry => ({
    kind: entry.kind,
    source: entry.source,
    totalMs: round(entry.totalMs),
    queueMs: round(entry.queueMs),
    workerMs: round(entry.workerMs),
    buildMs: round(entry.buildMs),
  }))
}

/** Totals per source, so a sweep dominated by dispatch or by cache reads is obvious. */
function fetchTotals() {
  const totals = new Map<string, { count: number; totalMs: number; slowestMs: number }>()
  for (const entry of recent) {
    const row = totals.get(entry.source) ?? { count: 0, totalMs: 0, slowestMs: 0 }
    row.count += 1
    row.totalMs += entry.totalMs
    row.slowestMs = Math.max(row.slowestMs, entry.totalMs)
    totals.set(entry.source, row)
  }
  return [...totals].map(([source, row]) => ({
    source,
    count: row.count,
    totalMs: round(row.totalMs),
    slowestMs: round(row.slowestMs),
  }))
}

export function reportDpsCache(entries: ReadonlyMap<string, DpsEntry>, retention: Record<DpsKind, number>) {
  if (!enabled) return
  // The newest snapshot wins: a burst keeps overwriting this while the report is
  // pending, so the flushed report describes where the burst settled rather than
  // the first write in it.
  latest = { entries, retention }
  if (pending) return
  pending = setTimeout(() => {
    pending = undefined
    const snapshot = latest
    if (!snapshot) return
    const rows = summarize(snapshot.entries, snapshot.retention)
    const summary = render(rows, snapshot.entries.size)
    if (summary === lastSummary) return
    lastSummary = summary
    console.groupCollapsed(`[DPS cache] ${summary}`)
    console.table(rows.map(row => Object.assign({ size: formatBytes(row.bytes) }, row)))
    console.info("Held results by size (serialized, not heap; shared references count once per occurrence).")
    console.table(fetchTotals())
    console.info(
      "Recent fetches. 'held' never built a bundle or reached a worker; 'joined' waited on someone else's job; 'dispatched' paid build + queue + worker.",
    )
    console.table(fetchRows())
    console.groupEnd()
  }, reportDelayMs)
}

/** Print the current occupancy immediately instead of waiting for the coalesced report. */
export function logDpsCacheNow(entries: ReadonlyMap<string, DpsEntry>, retention: Record<DpsKind, number>) {
  if (!enabled) return
  if (pending) clearTimeout(pending)
  pending = undefined
  lastSummary = ""
  reportDpsCache(entries, retention)
}
