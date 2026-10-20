import { assert, describe, it, vi } from "vitest"

/**
 * The dev-only occupancy report is the only visibility into whether a calculation was
 * reused or recomputed, so it is covered rather than trusted: it must collapse a burst
 * into one report, reprint when occupancy changes, and stay silent in a test build.
 */
async function withStore(mode: string, response: Record<string, unknown> = {}) {
  vi.resetModules()
  vi.stubEnv("MODE", mode)
  vi.stubEnv("DEV", true)
  class FakeWorker {
    listeners = new Map()
    addEventListener(type: string, listener: (event: any) => void) {
      const list = this.listeners.get(type) ?? []
      list.push(listener)
      this.listeners.set(type, list)
    }
    postMessage(message: any) {
      queueMicrotask(() => {
        for (const listener of this.listeners.get("message") ?? []) {
          listener({ data: { id: message.id, metrics: { dps: 1, breakdown: {}, ...response } } })
        }
      })
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", FakeWorker)
  return import("@/stores/dpsStore.ts")
}

const bundle = { timeline: { rotation: { name: "Diagnostics", steps: [] } }, weapons: [] } as never

function captureConsole() {
  const groups: string[] = []
  const tables: unknown[][] = []
  vi.spyOn(console, "groupCollapsed").mockImplementation((label?: string) => {
    if (label !== undefined) groups.push(label)
  })
  vi.spyOn(console, "table").mockImplementation(rows => {
    tables.push(rows as unknown[])
  })
  vi.spyOn(console, "info").mockImplementation(() => {})
  return { groups, tables, restore: () => vi.restoreAllMocks() }
}

/**
 * Each report prints occupancy, then per-source totals, then per-fetch rows. Only the
 * occupancy table carries a retention bound, which identifies it without depending on
 * the order the report happens to print them in.
 */
function latestOccupancy(tables: unknown[][]) {
  const occupancy = tables.filter(rows => rows.length > 0 && Object.hasOwn(rows[0] as object, "limit"))
  return occupancy.at(-1) as Array<Record<string, unknown>>
}

/** Long enough for the report's coalescing delay to have elapsed. */
const settle = () => new Promise(resolve => setTimeout(resolve, 300))

/**
 * The bounds the store ships with. They are small enough that a burst of baselines saturates the
 * first of them, so a test that needs its summary to keep changing has to touch another kind.
 */
const baselineLimit = 4
const throughputLimit = 64

describe("dps-store-diagnostics", () => {
  it("collapses a burst into one report and reprints when occupancy changes", async () => {
    const { useDpsStore } = await withStore("development")
    const console_ = captureConsole()
    try {
      const store = () => useDpsStore.getState()
      await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          store().ensure({ kind: "baseline", cacheKey: `burst-${index}`, build: () => bundle }),
        ),
      )
      await settle()
      assert.equal(console_.groups.length, 1, "A burst of calculations did not collapse into one report.")
      // More baselines than the bound holds, so the report shows the bound being reached rather
      // than the number that happened to be requested.
      assert.match(
        console_.groups[0],
        new RegExp(`baseline ${baselineLimit}/${baselineLimit}`),
        `Unexpected report: ${console_.groups[0]}`,
      )

      await settle()
      assert.equal(console_.groups.length, 1, "An unchanged summary was reprinted.")

      // A further baseline cannot change the summary, because occupancy is already at its bound,
      // so the kind that still has room is what proves a reprint follows a change.
      await store().ensure({ kind: "baseline", cacheKey: "burst-extra", build: () => bundle })
      await settle()
      assert.equal(console_.groups.length, 1, "A summary that could not have changed was reprinted.")

      await store().ensure({ kind: "throughput", cacheKey: "burst-reading", build: () => bundle })
      await settle()
      assert.equal(console_.groups.length, 2, "A changed summary was not reported.")
      assert.match(
        console_.groups[1],
        new RegExp(`throughput 1/${throughputLimit}`),
        `Unexpected report: ${console_.groups[1]}`,
      )

      const rows = latestOccupancy(console_.tables)
      assert.equal(rows.find(row => row.kind === "baseline")!.ready, baselineLimit)
      assert.equal(rows.find(row => row.kind === "baseline")!.limit, baselineLimit)
      assert.equal(rows.find(row => row.kind === "throughput")!.limit, throughputLimit)
      assert.equal(rows.find(row => row.kind === "editorTimeline")!.limit, 0)
      store().reset()
      // The report is coalesced on a timer, so let the reset's own report print before
      // the spy is restored. Otherwise it lands in the next test's console.
      await settle()
    } finally {
      console_.restore()
    }
  })

  it("accounts for held results by size and reports it in the summary", async () => {
    // A response big enough to leave the byte range, so the unit conversion is exercised.
    const { useDpsStore } = await withStore("development", { filler: "x".repeat(4096) })
    const console_ = captureConsole()
    try {
      const store = () => useDpsStore.getState()
      const bulky = { timeline: { rotation: { name: "Bulky", steps: [] } } } as never
      await store().ensure({ kind: "baseline", cacheKey: "bulky", build: () => bulky })
      await settle()

      const rows = latestOccupancy(console_.tables)
      const baseline = rows.find(row => row.kind === "baseline")!
      assert.equal(baseline.ready, 1)
      assert.ok(Number(baseline.bytes) > 4096, `Expected the held result to be measured, got ${baseline.bytes} bytes.`)
      assert.match(String(baseline.size), /KB|MB/, `Size was not formatted for reading: ${baseline.size}`)
      assert.match(console_.groups.at(-1)!, /serialized [\d.]+ (KB|MB)/, "The summary omitted the total size.")

      // A repeat of the same result is the same object, so it must not be measured twice.
      await store().ensure({ kind: "baseline", cacheKey: "bulky", build: () => bulky })
      await settle()
      const after = latestOccupancy(console_.tables)
      assert.equal(after.find(row => row.kind === "baseline")!.bytes, baseline.bytes)
      store().reset()
      // The report is coalesced on a timer, so let the reset's own report print before
      // the spy is restored. Otherwise it lands in the next test's console.
      await settle()
    } finally {
      console_.restore()
    }
  })

  it("reports a retention bound being reached", async () => {
    const { useDpsStore } = await withStore("development")
    const console_ = captureConsole()
    try {
      const store = () => useDpsStore.getState()
      await Promise.all(
        Array.from({ length: baselineLimit * 4 }, (_, index) =>
          store().ensure({ kind: "baseline", cacheKey: `fill-${index}`, build: () => bundle }),
        ),
      )
      await settle()
      assert.match(
        console_.groups.at(-1)!,
        new RegExp(`baseline ${baselineLimit}/${baselineLimit}`),
        "Occupancy did not stop at the retention bound.",
      )
      store().reset()
      // The report is coalesced on a timer, so let the reset's own report print before
      // the spy is restored. Otherwise it lands in the next test's console.
      await settle()
    } finally {
      console_.restore()
    }
  })

  it("stays silent in a test build", async () => {
    const { useDpsStore } = await withStore("test")
    const console_ = captureConsole()
    try {
      await useDpsStore.getState().ensure({ kind: "baseline", cacheKey: "quiet", build: () => bundle })
      await settle()
      assert.deepEqual(console_.groups, [], "The cache reported occupancy in a test build.")
    } finally {
      console_.restore()
    }
  })
})
