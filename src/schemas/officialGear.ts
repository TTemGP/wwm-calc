import * as v from "valibot"

export const officialGearRoleSchema = v.looseObject({ wearEquipsDetailed: v.record(v.string(), v.unknown()) })
