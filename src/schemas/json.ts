import * as v from "valibot"

export type SchemaResult<T> = { success: true; output: T } | { success: false }

export function validateUnknown<T>(schema: v.GenericSchema<T>, input: unknown): SchemaResult<T> {
  const result = v.safeParse(schema, input)
  return result.success ? { success: true, output: result.output } : { success: false }
}

export function parseJson<T>(schema: v.GenericSchema<T>, text: string): SchemaResult<T> {
  try {
    return validateUnknown(schema, JSON.parse(text) as unknown)
  } catch {
    return { success: false }
  }
}
