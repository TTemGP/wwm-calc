import { describe, expect, it } from "vitest"

import { deploymentVersionSchema, localeManifestSchema, localeMessagesSchema } from "../src/schemas/http"
import { parseJson, validateUnknown } from "../src/schemas/json"

describe("runtime JSON validation", () => {
  it("parses valid JSON through a schema without exposing parser issues", () => {
    const result = parseJson(deploymentVersionSchema, JSON.stringify({ version: "next" }))
    expect(result).toEqual({ success: true, output: { version: "next" } })
  })

  it("rejects invalid JSON and malformed network payloads", () => {
    expect(parseJson(deploymentVersionSchema, "not json")).toEqual({ success: false })
    expect(validateUnknown(localeManifestSchema, null)).toEqual({ success: false })
    expect(validateUnknown(localeManifestSchema, { default: "en", locales: [1] })).toEqual({ success: false })
    expect(validateUnknown(localeMessagesSchema, { greeting: 42 })).toEqual({ success: false })
  })

  it("preserves unknown fields only for loose payloads", () => {
    const result = validateUnknown(localeMessagesSchema, { greeting: "hello", future: "value" })
    expect(result).toEqual({ success: true, output: { greeting: "hello", future: "value" } })
  })
})
