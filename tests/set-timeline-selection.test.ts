import { describe, expect, it } from "vitest"

import { selectSetTier, setSelectionChangesTimeline, type SetDefinition } from "../src/gear"

const definitions = {
  Timed: {
    name: "Timed",
    tags: [],
    altersTimeline: true,
    options: { "0": { name: "Inactive" }, "2": { name: "Two pieces" }, "4": { name: "Four pieces" } },
  },
  Plain: {
    name: "Plain",
    tags: [],
    altersTimeline: false,
    options: { "0": { name: "Inactive" }, "2": { name: "Two pieces" }, "4": { name: "Four pieces" } },
  },
} satisfies Record<string, SetDefinition>

describe("set timeline selection", () => {
  it("rebuilds when selecting a static set displaces a timeline-changing set", () => {
    const current = { Timed: 4, Plain: 0 } as const
    const replacement = selectSetTier(current, "Plain", 4, definitions)
    expect(replacement).toEqual({ Timed: 0, Plain: 4 })
    expect(setSelectionChangesTimeline(current, replacement, definitions)).toBe(true)
  })

  it("reuses the timeline when only a static set tier changes", () => {
    const current = { Timed: 0, Plain: 2 } as const
    const replacement = selectSetTier(current, "Plain", 4, definitions)
    expect(setSelectionChangesTimeline(current, replacement, definitions)).toBe(false)
  })

  it("rebuilds when a timeline-changing set is added or changes tier", () => {
    expect(setSelectionChangesTimeline({}, { Timed: 2 }, definitions)).toBe(true)
    expect(setSelectionChangesTimeline({ Timed: 2 }, { Timed: 4 }, definitions)).toBe(true)
  })

  it("reuses the timeline for unchanged selections and omitted inactive sets", () => {
    expect(setSelectionChangesTimeline({ Timed: 4 }, { Timed: 4 }, definitions)).toBe(false)
    expect(setSelectionChangesTimeline({}, { Timed: 0, Plain: 0 }, definitions)).toBe(false)
  })
})
