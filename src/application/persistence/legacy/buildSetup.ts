import * as v from "valibot"

import { getPersistentItem } from "../../../persistentStorage"
import { parseJson } from "../../../schemas/json"
import { arsenalStorageKey, bowRingSetStorageKey, gearSetStorageKey, legacyInnerWayStorageKey } from "../keys"

const legacyInnerWaysSchema = v.array(v.unknown())
// The standalone gear-set key is a direct map, not a BuildSetupOverrides envelope.
const legacyGearSetMapSchema = v.record(v.string(), v.unknown())

type LegacySetSelections = v.InferOutput<typeof legacyGearSetMapSchema>

export type LegacyBuildSetup = {
  innerWays?: v.InferOutput<typeof legacyInnerWaysSchema>
  weaponSets?: LegacySetSelections
  bowRingSet?: string
  arsenal?: string
}

function readLegacyJson<T>(key: string, schema: v.GenericSchema<T>) {
  const saved = getPersistentItem(key)
  if (saved === null) return undefined
  const parsed = parseJson(schema, saved)
  return parsed.success ? parsed.output : undefined
}

export function readLegacyBuildSetup(): LegacyBuildSetup {
  const innerWays = readLegacyJson(legacyInnerWayStorageKey, legacyInnerWaysSchema)
  const weaponSets = readLegacyJson(gearSetStorageKey, legacyGearSetMapSchema)
  const bowRingSet = getPersistentItem(bowRingSetStorageKey)
  const arsenal = getPersistentItem(arsenalStorageKey)
  return {
    ...(innerWays === undefined ? {} : { innerWays }),
    ...(weaponSets === undefined ? {} : { weaponSets }),
    ...(bowRingSet === null ? {} : { bowRingSet }),
    ...(arsenal === null ? {} : { arsenal }),
  }
}
