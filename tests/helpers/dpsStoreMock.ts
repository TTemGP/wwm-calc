import { vi } from "vitest"

/**
 * Stand-in for the calculation store. Tests that render the editor only need to
 * control what a calculation resolves to, so a request stays pending unless a test
 * registers a handler for its kind. Held results are cached per cache key, so a repeat
 * request resolves without dispatching again, as the real store does.
 */
const mock = {
  handlers: new Map<string, (request: any) => Promise<unknown>>(),
  requests: [] as any[],
  dispatches: [] as any[],
  held: new Map<string, unknown>(),
  inFlight: new Map<string, Promise<unknown>>(),
}

/**
 * The real store keys its results by kind as well as by the caller's cache key, so two
 * kinds choosing the same string do not answer for one another.
 */
const entryKey = (kind: string, cacheKey: string) => `${kind}:${cacheKey}`

/**
 * Forget held results and recorded requests so each test starts from an empty store.
 * Registered handlers survive, matching a per-file stand-in that a test may re-register.
 */
export function resetDpsMock() {
  mock.requests.length = 0
  mock.dispatches.length = 0
  mock.held.clear()
  mock.inFlight.clear()
}

/** Register the result for one calculation kind. Unhandled kinds never settle. */
export function dpsResolves(kind: string, handler: (request: any) => Promise<unknown>) {
  mock.handlers.set(kind, handler)
}

export function dpsRequests(kind: string) {
  return mock.requests.filter(request => request.kind === kind)
}

/** Requests that actually reached a worker, as opposed to resolving from a held result. */
export function dpsDispatches(kind: string) {
  return mock.dispatches.filter(request => request.kind === kind)
}

/** Cache keys the store is still holding a result for, as the real store's entry map. */
export function dpsHeldKeys() {
  return [...mock.held.keys()]
}

/**
 * Bundles handed to the worker for one kind. A request builds its bundle lazily, so
 * tests that assert on the bundle build it here rather than reaching into the thunk.
 */
export function dpsBundles(kind: string) {
  return dpsDispatches(kind).map(request => request.build())
}

/**
 * The store holds no editor timeline, because that result is keyed by rotation rather
 * than by revision and would answer a later revision with an earlier timeline.
 */
const retained = (kind: string) => kind !== "editorTimeline"

export function mockDpsStore() {
  const never = () => new Promise<never>(() => {})
  return {
    useDpsStore: {
      getState: () => ({
        entries: new Map(mock.held),
        ensure: vi.fn<(request: any) => Promise<unknown>>(async request => {
          mock.requests.push(request)
          const key = entryKey(request.kind, request.cacheKey)
          if (retained(request.kind) && mock.held.has(key)) return mock.held.get(key)
          // The real store keeps in-flight work outside the result map, so two callers asking for
          // the same calculation join one job rather than each reaching a worker. Without this a
          // caller that asks while another is still waiting would be counted as a second dispatch.
          const running = mock.inFlight.get(key)
          if (running) return running
          const job = (async () => {
            mock.dispatches.push(request)
            const handler = mock.handlers.get(request.kind)
            if (!handler) return never()
            const result = await handler(request)
            if (retained(request.kind)) mock.held.set(key, result)
            return result
          })()
          mock.inFlight.set(key, job)
          try {
            return await job
          } finally {
            if (mock.inFlight.get(key) === job) mock.inFlight.delete(key)
          }
        }),
        peek: vi.fn<(kind: string, cacheKey: string) => unknown>((kind, cacheKey) =>
          mock.held.get(entryKey(kind, cacheKey)),
        ),
        supersede: vi.fn<() => void>(),
        cancel: vi.fn<(kind: string, cacheKey: string) => void>(),
        // The real reset terminates the workers, so a worker's caches go with them. A
        // stand-in has no workers, so dropping the held results is the observable part.
        reset: vi.fn<() => void>(() => {
          mock.held.clear()
          mock.inFlight.clear()
        }),
      }),
    },
  }
}
