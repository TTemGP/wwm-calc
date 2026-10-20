import * as v from "valibot"

import { parseJson } from "../../../schemas/json"
import { legacyGearStorageKey } from "../keys"

const legacyGearInventorySchema = v.looseObject({
  items: v.optional(v.array(v.unknown())),
  equipped: v.optional(v.record(v.string(), v.unknown())),
})

export type LegacyGearInventory = v.InferOutput<typeof legacyGearInventorySchema>

// The original migration-only loader read localStorage directly. Keep that
// storage source while moving its historical format contract behind this boundary.
export function readLegacyGearInventory(storage: Pick<Storage, "getItem">): LegacyGearInventory | undefined {
  const saved = storage.getItem(legacyGearStorageKey)
  if (saved === null) return undefined
  const parsed = parseJson(legacyGearInventorySchema, saved)
  return parsed.success ? parsed.output : undefined
}
