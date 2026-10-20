import * as v from "valibot"

import { getPersistentItem } from "../../../persistentStorage"
import { parseJson } from "../../../schemas/json"
import { legacyCharacterStatsStorageKey } from "../keys"

// The historical record accepted unknown stat keys; the current loader owns
// known-key filtering and the v2-to-v3 percentage/alias translation.
const legacyCharacterStatsSchema = v.looseObject({})

export type LegacyCharacterStats = v.InferOutput<typeof legacyCharacterStatsSchema>

export function readLegacyCharacterStats(): LegacyCharacterStats | undefined {
  const saved = getPersistentItem(legacyCharacterStatsStorageKey)
  if (saved === null) return undefined
  const parsed = parseJson(legacyCharacterStatsSchema, saved)
  return parsed.success ? parsed.output : undefined
}
