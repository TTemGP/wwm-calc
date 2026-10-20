import * as v from "valibot"

const finiteNumber = v.pipe(v.number(), v.finite())
const setSelectionsInputSchema = v.record(v.string(), v.unknown())
const innerWaySelections = v.array(v.unknown())

export const buildSetupInputSchema = v.looseObject({
  innerWays: v.optional(innerWaySelections),
  weaponSets: v.optional(setSelectionsInputSchema),
  armorSets: v.optional(setSelectionsInputSchema),
  bowRingSet: v.optional(v.unknown()),
  arsenal: v.optional(v.unknown()),
  gearSets: v.optional(setSelectionsInputSchema),
})

export const buildSetupOverridesInputSchema = buildSetupInputSchema

export type BuildSetupInput = v.InferOutput<typeof buildSetupInputSchema>
export { finiteNumber }
