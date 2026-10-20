import { customPercentileStorageKey } from "@/application/persistence/keys"
import { t } from "@/i18n"
import { getPersistentItem, setPersistentItem } from "@/persistentStorage"
import { parseJson } from "@/schemas/json"
import { simulationPercentilesSchema } from "@/schemas/storage"

/**
 * The percentiles the results table always shows, which is why one of these cannot be added as a
 * custom percentile: adding it would put the same row in the table twice.
 */
const presetPercentiles = new Set([99, 95, 90, 75, 50])

export type PercentileAddition = { ok: true; percentiles: number[] } | { ok: false; error: string }

/**
 * The user's own percentiles, read from storage.
 *
 * A stored value at or above 100 is dropped rather than clamped, because a percentile at 100 is
 * the median and the table already has that row, so a stored one is a record the user cannot have
 * meant. A stored preset is dropped for the same reason: the table shows it whether or not it is
 * listed here.
 */
export function loadCustomPercentiles(): number[] {
  const result = parseJson(simulationPercentilesSchema, getPersistentItem(customPercentileStorageKey) ?? "[]")
  if (!result.success) return []
  return [...new Set(result.output.filter(value => value < 100 && !presetPercentiles.has(value)))].toSorted(
    (left, right) => right - left,
  )
}

export function persistCustomPercentiles(percentiles: readonly number[]) {
  setPersistentItem(customPercentileStorageKey, JSON.stringify(percentiles))
}

/**
 * Adds a percentile the user typed, or explains why it cannot be added.
 *
 * This decides and reports rather than reading or storing, so the three rejections are stated
 * once and the caller is left holding a list it can render without re-checking anything.
 */
export function addCustomPercentile(current: readonly number[], draft: string): PercentileAddition {
  const percentile = Number(draft)
  if (!draft.trim() || !Number.isFinite(percentile) || percentile < 0 || percentile >= 100) {
    return { ok: false, error: t("ui.simulationTab.percentileRangeError") }
  }
  if (presetPercentiles.has(percentile)) {
    return { ok: false, error: t("ui.simulationTab.percentilePresetError", { percentile }) }
  }
  if (current.includes(percentile)) {
    return { ok: false, error: t("ui.simulationTab.percentileDuplicateError", { percentile }) }
  }
  return { ok: true, percentiles: [...current, percentile].toSorted((left, right) => right - left) }
}

export function withoutPercentile(current: readonly number[], percentile: number) {
  return current.filter(value => value !== percentile)
}
