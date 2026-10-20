import { assert, describe, it, vi } from "vitest"

/**
 * The per-fetch timings exist to tell a fast path from a slow one, so what matters is
 * that each source is distinguished: a held result must cost neither a bundle nor a
 * worker, a joined request must not be dispatched twice, and a dispatched one must
 * report the build separately from the wait and the run.
 */
async function withStore() {
  vi.resetModules()
  vi.stubEnv("MODE", "development")
  vi.stubEnv("DEV", true)
  const posted: any[] = []
  class FakeWorker {
    listeners = new Map()
    addEventListener(type: string, listener: (event: any) => void) {
      const list = this.listeners.get(type) ?? []
      list.push(listener)
      this.listeners.set(type, list)
    }
    postMessage(message: any) {
      posted.push(message)
      queueMicrotask(() => {
        for (const listener of this.listeners.get("message") ?? []) {
          listener({ data: { id: message.id, metrics: { dps: 1, breakdown: {} } } })
        }
      })
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", FakeWorker)
  const { useDpsStore } = await import("@/stores/dpsStore.ts")
  const diagnostics = await import("@/stores/dpsStoreDiagnostics.ts")
  return { useDpsStore, posted, diagnostics }
}

const bundle = { timeline: { rotation: { name: "Timing", steps: [] } }, weapons: [] } as never

function captureConsole() {
  const tables: any[][] = []
  const infos: string[] = []
  vi.spyOn(console, "groupCollapsed").mockImplementation(() => {})
  vi.spyOn(console, "table").mockImplementation(rows => {
    tables.push(rows as any[])
  })
  vi.spyOn(console, "info").mockImplementation(message => {
    infos.push(String(message))
  })
  return { tables, infos, restore: () => vi.restoreAllMocks() }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 300))

/** The most recent fetch table: the last one reported. */
function recentFetchTable(tables: any[][]) {
  return tables.at(-1) ?? []
}

describe("dps-fetch-timing", () => {
  it("separates a held result from a dispatched one", async () => {
    const { useDpsStore, posted } = await withStore()
    const console_ = captureConsole()
    try {
      const store = () => useDpsStore.getState()
      let builds = 0
      const build = () => {
        builds += 1
        return bundle
      }
      await store().ensure({ kind: "baseline", cacheKey: "shared", build })
      await store().ensure({ kind: "baseline", cacheKey: "shared", build })
      await settle()

      const rows = recentFetchTable(console_.tables)
      assert.deepEqual(
        rows.map(row => row.source),
        ["dispatched", "held"],
        "The two requests were not distinguished by source.",
      )
      assert.equal(builds, 1, "A held result still built its bundle.")
      assert.equal(posted.length, 1, "A held result still reached a worker.")
      assert.equal(rows[1].workerMs, 0, "A held result reported worker time.")
      assert.equal(rows[1].queueMs, 0, "A held result reported queue time.")
      assert.ok(rows[0].workerMs >= 0, "A dispatched result reported no worker time.")
      store().reset()
    } finally {
      console_.restore()
    }
  })

  it("marks a request that waited on an identical in-flight job as joined", async () => {
    vi.resetModules()
    vi.stubEnv("MODE", "development")
    vi.stubEnv("DEV", true)
    const posted: any[] = []
    class SlowWorker {
      listeners = new Map()
      addEventListener(type: string, listener: (event: any) => void) {
        const list = this.listeners.get(type) ?? []
        list.push(listener)
        this.listeners.set(type, list)
      }
      postMessage(message: any) {
        posted.push(message)
        setTimeout(() => {
          for (const listener of this.listeners.get("message") ?? []) {
            listener({ data: { id: message.id, metrics: { dps: 1, breakdown: {} } } })
          }
        }, 20)
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", SlowWorker)
    const { useDpsStore } = await import("@/stores/dpsStore.ts")
    const console_ = captureConsole()
    try {
      const store = () => useDpsStore.getState()
      const [first, second] = await Promise.all([
        store().ensure({ kind: "baseline", cacheKey: "race", build: () => bundle }),
        store().ensure({ kind: "baseline", cacheKey: "race", build: () => bundle }),
      ])
      await settle()
      assert.ok(first !== undefined && second !== undefined)
      assert.equal(posted.length, 1, "Concurrent identical requests were dispatched twice.")
      const rows = recentFetchTable(console_.tables)
      assert.deepEqual(
        rows.map(row => row.source).sort(),
        ["dispatched", "joined"],
        "One request was not recorded as joining the other's job.",
      )
      store().reset()
    } finally {
      console_.restore()
    }
  })

  it("reports queue and worker time separately when the pool is saturated", async () => {
    vi.resetModules()
    vi.stubEnv("MODE", "development")
    vi.stubEnv("DEV", true)
    class SlowWorker {
      listeners = new Map()
      addEventListener(type: string, listener: (event: any) => void) {
        const list = this.listeners.get(type) ?? []
        list.push(listener)
        this.listeners.set(type, list)
      }
      postMessage(message: any) {
        setTimeout(() => {
          for (const listener of this.listeners.get("message") ?? []) {
            listener({ data: { id: message.id, metrics: { dps: 1, breakdown: {} } } })
          }
        }, 30)
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", SlowWorker)
    const { useDpsStore } = await import("@/stores/dpsStore.ts")
    const console_ = captureConsole()
    try {
      const store = () => useDpsStore.getState()
      // More requests than the pool holds workers, so some must wait for one.
      const keys = Array.from({ length: 8 }, (_, index) => `key-${index}`)
      await Promise.all(keys.map(key => store().ensure({ kind: "baseline", cacheKey: key, build: () => bundle })))
      await settle()
      const rows = recentFetchTable(console_.tables)
      assert.equal(rows.length, keys.length, "Not every request was timed.")
      const queued = rows.filter(row => (row.queueMs as number) > 0)
      assert.ok(queued.length > 0, "Every request got a worker immediately, so nothing was ever measured waiting.")
      for (const row of queued) {
        assert.ok(
          (row.workerMs as number) > 0,
          "A request reported a wait but no run time, so the two are not separated.",
        )
      }
      const unqueued = rows.filter(row => (row.queueMs as number) === 0)
      assert.ok(unqueued.length > 0, "No request ran without waiting, so the pool gave each its own worker.")
      store().reset()
    } finally {
      console_.restore()
    }
  })
})
