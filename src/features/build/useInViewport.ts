import { useEffect, useRef, useState } from "react"

/**
 * Whether the element is on screen now, and a ref to put on it.
 *
 * The root is the viewport, which is what "visible" means here. An element scrolled out of the
 * build panel's own scroller reports false even though it is still inside the document, because
 * an observer intersects against every clipping ancestor, not just the root.
 *
 * Work already dispatched is not recalled when the element leaves: two cards can resolve to the
 * same measurement, so cancelling on un-observe would tear down a reading something else is
 * waiting for. A target that scrolls away stops being asked for, and its result is still held
 * for when it comes back.
 */
export function useInViewport<T extends Element>(enabled: boolean) {
  const ref = useRef<T>(null)
  const [observed, setObserved] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const element = ref.current
    // Without an observer there is nothing to wait for, so measure rather than never measure.
    if (!element || typeof IntersectionObserver === "undefined") {
      setObserved(true)
      return
    }
    const observer = new IntersectionObserver(entries => setObserved(entries.some(entry => entry.isIntersecting)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled])

  // A card that is not observing is never on screen, so the flag is derived rather than cleared,
  // which keeps a disabled card from scheduling a render to say nothing changed.
  return { ref, visible: enabled && observed }
}
