import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
  type RefObject,
} from "react"

/** Must match the `gap` on `.rotation-step-list`, so spacer heights reproduce the real rhythm. */
const ROW_GAP = 7

type MeasuredHeights = Record<string, number>

/**
 * Windowing for the rotation step list.
 *
 * Row heights vary because cell contents wrap, and a windowed list only knows the height
 * of the rows it has actually rendered. Reserving space for the rest from an average is
 * not stable: every newly measured row replaces an estimate and moves the total by
 * (real - average), so the scroll extent swings in both directions, the browser clamps
 * `scrollTop`, and the list appears to bounce back with its last row unreachable.
 *
 * So the list is measured before it is windowed. `layoutKey` changes whenever the grid
 * columns change — an extra column re-wraps every cell — and invalidates those heights.
 * Until every row has a real height the whole list renders; once it does, only the rows
 * near the viewport do, and the total height is exact and stops moving.
 *
 * When heights cannot be obtained at all — hidden, or a test environment without layout —
 * the full list stays rendered, so nothing can disappear where layout metrics do not exist.
 */
const NO_HEIGHTS: MeasuredHeights = {}

export function useVirtualRowWindow({
  keys,
  containerRef,
  listRef,
  layoutKey,
  overscan = 12,
}: {
  keys: readonly string[]
  containerRef: RefObject<HTMLElement | null>
  listRef: RefObject<HTMLElement | null>
  /** Changes when the row layout changes, forcing a fresh measuring pass. */
  layoutKey: string
  overscan?: number
}) {
  // Measurements are tagged with the layout they were taken in, so a layout change simply
  // makes them stale instead of needing an effect to clear them.
  const [measurement, setMeasurement] = useState<{ layoutKey: string; heights: MeasuredHeights }>()
  const heights = measurement?.layoutKey === layoutKey ? measurement.heights : NO_HEIGHTS
  const [window, setWindow] = useState({ start: 0, end: keys.length })
  const pendingFrame = useRef<number | undefined>(undefined)
  const flushFrame = useRef<number | undefined>(undefined)
  const scheduled = useRef(false)
  const pendingHeights = useRef<MeasuredHeights>({})
  const rowObservers = useRef(new Map<string, ResizeObserver>())
  const measureCallbacks = useRef(new Map<string, RefCallback<HTMLElement>>())

  // Every row must have a real height before windowing can be trusted; until then the
  // estimated total is the full list, which is exactly what a full render produces.
  const fullyMeasured = keys.length > 0 && keys.every(key => heights[key] !== undefined)
  const offsets = useMemo(() => buildOffsets(keys, heights), [keys, heights])

  const listOffset = useCallback(() => {
    const container = containerRef.current
    const list = listRef.current
    if (!container || !list) return 0
    return list.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
  }, [containerRef, listRef])

  const applyWindow = useCallback(() => {
    const container = containerRef.current
    const total = offsets[keys.length]
    // Without a complete measuring pass, or without layout to measure against, the whole
    // list stays rendered: an approximate scroll height is worse than none.
    if (!fullyMeasured || !container || container.clientHeight === 0 || keys.length === 0) {
      setWindow(previous =>
        previous.start === 0 && previous.end === keys.length ? previous : { start: 0, end: keys.length },
      )
      return
    }
    if (total <= container.clientHeight) {
      setWindow(previous =>
        previous.start === 0 && previous.end === keys.length ? previous : { start: 0, end: keys.length },
      )
      return
    }
    const scrollTop = container.scrollTop - listOffset()
    const end = firstEndingAfter(offsets, scrollTop + container.clientHeight)
    const start = firstEndingAfter(offsets, scrollTop)
    setWindow(previous => {
      const next = { start: Math.max(0, start - overscan), end: Math.min(keys.length, end + overscan) }
      return previous.start === next.start && previous.end === next.end ? previous : next
    })
  }, [containerRef, fullyMeasured, keys, listOffset, offsets, overscan])

  const scheduleWindow = useCallback(() => {
    if (pendingFrame.current !== undefined) return
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = undefined
      applyWindow()
    })
  }, [applyWindow])

  // Ref callbacks fire during the commit, once per mounted row, and a row can resize later
  // when its own content changes. Both paths record a height and request one coalesced
  // flush, so a window shift costs a single re-render rather than one per row.
  const flush = useCallback(() => {
    if (scheduled.current) return
    scheduled.current = true
    flushFrame.current = requestAnimationFrame(() => {
      scheduled.current = false
      flushFrame.current = undefined
      const pending = pendingHeights.current
      if (Object.keys(pending).length === 0) return
      pendingHeights.current = {}
      setMeasurement(previous => {
        const base = previous?.layoutKey === layoutKey ? previous.heights : NO_HEIGHTS
        const next = { ...base }
        let changed = false
        for (const [key, height] of Object.entries(pending)) {
          if (next[key] === height) continue
          next[key] = height
          changed = true
        }
        return changed ? { layoutKey, heights: next } : previous
      })
    })
  }, [layoutKey])

  useLayoutEffect(() => {
    applyWindow()
  }, [applyWindow, keys])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onScroll = () => scheduleWindow()
    container.addEventListener("scroll", onScroll, { passive: true })
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => scheduleWindow())
    observer?.observe(container)
    return () => {
      container.removeEventListener("scroll", onScroll)
      observer?.disconnect()
    }
  }, [containerRef, scheduleWindow])

  useEffect(
    () => () => {
      if (pendingFrame.current !== undefined) cancelAnimationFrame(pendingFrame.current)
      if (flushFrame.current !== undefined) cancelAnimationFrame(flushFrame.current)
      // Clearing the guard matters: a cancelled frame never runs, so leaving the flag set
      // would wedge every later measurement and the window would never engage.
      flushFrame.current = undefined
      scheduled.current = false
      for (const observer of rowObservers.current.values()) observer.disconnect()
    },
    [],
  )

  const measure = useCallback(
    (key: string): RefCallback<HTMLElement> => {
      const existing = measureCallbacks.current.get(key)
      if (existing) return existing
      const record = (node: HTMLElement) => {
        const height = node.offsetHeight
        if (height > 0) pendingHeights.current[key] = height
        flush()
      }
      const callback: RefCallback<HTMLElement> = node => {
        rowObservers.current.get(key)?.disconnect()
        rowObservers.current.delete(key)
        if (!node) return
        record(node)
        if (typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(() => record(node))
        observer.observe(node)
        rowObservers.current.set(key, observer)
      }
      measureCallbacks.current.set(key, callback)
      return callback
    },
    [flush],
  )

  const scrollToKey = useCallback(
    (key: string, align: "start" | "center" | "nearest" = "nearest") => {
      const container = containerRef.current
      if (!container || container.clientHeight === 0) return
      const index = keys.indexOf(key)
      if (index < 0) return
      const top = listOffset() + offsets[index]
      const height = offsets[index + 1] - offsets[index]
      let next = container.scrollTop
      if (align === "start") next = top
      else if (align === "center") next = top - container.clientHeight / 2 + height / 2
      else if (top < container.scrollTop) next = top
      else if (top + height > container.scrollTop + container.clientHeight) {
        next = top + height - container.clientHeight
      }
      container.scrollTop = Math.max(0, next)
      applyWindow()
    },
    [applyWindow, containerRef, keys, listOffset, offsets],
  )

  const { start, end } = window
  return {
    start,
    end,
    paddingTop: start === 0 ? 0 : offsets[start],
    paddingBottom: end >= keys.length ? 0 : offsets[keys.length] - offsets[end],
    measure,
    scrollToKey,
  }
}

/** Prefix offsets: `offsets[i]` is where row `i` starts and `offsets[length]` is the total height. */
function buildOffsets(keys: readonly string[], heights: MeasuredHeights): number[] {
  const offsets = Array.from({ length: keys.length + 1 }, () => 0)
  for (let index = 0; index < keys.length; index += 1) {
    const height = heights[keys[index]] ?? 0
    offsets[index + 1] = offsets[index] + height + (index < keys.length - 1 ? ROW_GAP : 0)
  }
  return offsets
}

/** Smallest index whose row extends past `value`. */
function firstEndingAfter(offsets: number[], value: number): number {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (offsets[middle + 1] > value) high = middle
    else low = middle + 1
  }
  return low
}
