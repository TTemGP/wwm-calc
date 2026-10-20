import * as v from "valibot"

export const skillOverridesInputSchema = v.looseObject({
  version: v.optional(v.pipe(v.number(), v.finite())),
  overrides: v.optional(v.record(v.string(), v.unknown())),
})
