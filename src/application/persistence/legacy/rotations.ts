import * as v from "valibot"

import { getPersistentItem } from "../../../persistentStorage"
import { parseJson } from "../../../schemas/json"
import { rotationStorageKey } from "../keys"

const legacyRotationSchema = v.looseObject({ name: v.optional(v.string()), steps: v.array(v.unknown()) })

export type LegacyRotation = v.InferOutput<typeof legacyRotationSchema>

export function readLegacyRotation(): LegacyRotation | undefined {
  const saved = getPersistentItem(rotationStorageKey)
  if (saved === null) return undefined
  const parsed = parseJson(legacyRotationSchema, saved)
  return parsed.success ? parsed.output : undefined
}
