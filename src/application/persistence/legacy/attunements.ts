import * as v from "valibot"

import { getPersistentItem } from "../../../persistentStorage"
import { parseJson } from "../../../schemas/json"
import { legacyAttunementStorageKey } from "../keys"

// The historical record accepted unknown attunement keys; the current loader
// owns known-key filtering and the v1 percentage conversion.
const legacyAttunementStatsSchema = v.looseObject({})

export type LegacyAttunementStats = v.InferOutput<typeof legacyAttunementStatsSchema>

export function readLegacyAttunementStats(): LegacyAttunementStats | undefined {
  const saved = getPersistentItem(legacyAttunementStorageKey)
  if (saved === null) return undefined
  const parsed = parseJson(legacyAttunementStatsSchema, saved)
  return parsed.success ? parsed.output : undefined
}
