import * as v from "valibot"

export const characterProfileInputSchema = v.looseObject({
  id: v.string(),
  name: v.string(),
  statOverrides: v.optional(v.record(v.string(), v.unknown())),
  attunementOverrides: v.optional(v.record(v.string(), v.unknown())),
  innerWays: v.optional(v.array(v.unknown())),
  buildSetup: v.optional(v.unknown()),
})

export const characterProfileExportInputSchema = v.looseObject({
  format: v.string(),
  version: v.pipe(v.number(), v.finite()),
  profiles: v.array(v.unknown()),
})
