import { useCallback, useEffect, useState } from "react"

import {
  addCustomPercentile,
  loadCustomPercentiles,
  persistCustomPercentiles,
  withoutPercentile,
} from "./customPercentiles"

/**
 * What the editor can show and do about the user's percentiles, as one value so the editor is
 * handed the whole controller rather than a list of nine props that have to arrive together.
 */
export type CustomPercentileEditor = ReturnType<typeof useCustomPercentiles>

/**
 * The user's own percentiles, and the editor's draft state around adding one.
 *
 * The list is stored whenever it changes rather than on the way out, so a session that ends
 * mid-edit keeps the percentiles the user had already added.
 */
export function useCustomPercentiles() {
  const [customPercentiles, setCustomPercentiles] = useState<number[]>(loadCustomPercentiles)
  const [addingPercentile, setAddingPercentile] = useState(false)
  const [percentileDraft, setPercentileDraft] = useState("")
  const [percentileError, setPercentileError] = useState("")

  useEffect(() => persistCustomPercentiles(customPercentiles), [customPercentiles])

  const startAdding = useCallback(() => {
    setAddingPercentile(true)
    setPercentileError("")
  }, [])

  const stopAdding = useCallback(() => {
    setAddingPercentile(false)
    setPercentileError("")
  }, [])

  const addPercentile = useCallback(() => {
    const addition = addCustomPercentile(customPercentiles, percentileDraft)
    if (!addition.ok) {
      setPercentileError(addition.error)
      return
    }
    setCustomPercentiles(addition.percentiles)
    setPercentileDraft("")
    stopAdding()
  }, [customPercentiles, percentileDraft, stopAdding])

  const removePercentile = useCallback((percentile: number) => {
    setCustomPercentiles(current => withoutPercentile(current, percentile))
  }, [])

  return {
    customPercentiles,
    addingPercentile,
    percentileDraft,
    percentileError,
    setPercentileDraft,
    startAdding,
    stopAdding,
    addPercentile,
    removePercentile,
  }
}
