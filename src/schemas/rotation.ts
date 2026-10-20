import * as v from "valibot"

export const rotationStepInputSchema = v.looseObject({ type: v.string() })
export const rotationInputSchema = v.looseObject({
  name: v.string(),
  steps: v.array(v.unknown()),
  ping: v.optional(v.any()),
  enemyCount: v.optional(v.any()),
  groupSize: v.optional(v.any()),
  targetHP: v.optional(v.any()),
  targetType: v.optional(v.any()),
  dummyAttack: v.optional(v.any()),
  start: v.optional(v.unknown()),
})
export const rotationEntryInputSchema = v.looseObject({
  id: v.string(),
  rotation: rotationInputSchema,
  martialArts: v.optional(v.array(v.string())),
})
export const rotationExportInputSchema = v.looseObject({
  format: v.string(),
  version: v.pipe(v.number(), v.finite()),
  rotations: v.array(v.unknown()),
})
export const storedRotationInputSchema = v.looseObject({ name: v.optional(v.string()), steps: v.array(v.unknown()) })
export const storedRotationEntryInputSchema = v.looseObject({
  id: v.string(),
  rotation: storedRotationInputSchema,
  martialArts: v.optional(v.array(v.string())),
})
