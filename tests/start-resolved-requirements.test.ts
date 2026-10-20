import { describe, expect, it } from "vitest"

import { requirementsPass } from "../src/calculations/rotationTimeline"

// A rule that re-fires on an effect can test whether the effect was up when the
// skill started, then apply it when the hit lands. The element carrying
// resolveAt: "skillStart" reads the start state; its neighbours still read live state.
const effects = (entries: Record<string, { stack: number }>) => new Map(Object.entries(entries)) as never

describe("start-resolved requirements", () => {
  const live = effects({ SoulReturn: { stack: 1 } }) // Soulbreak has lapsed
  const start = effects({ Soulbreak: { stack: 1 }, SoulReturn: { stack: 1 } })
  const pass = (requirement: unknown) =>
    requirementsPass(
      requirement,
      live,
      live,
      ["BurnAndBury"],
      new Set<string>(),
      [],
      {},
      {},
      { buffs: start, debuffs: start },
    )

  it("reads the start state only for the marked element", () => {
    const plain = { target: "target", value: "Soulbreak" }
    const marked = { target: "target", value: "Soulbreak", resolveAt: "skillStart" }

    // Unmarked, the live state decides and the lapsed effect is not seen.
    expect(pass([plain])).toBe(false)
    // Marked, the start state decides and the effect counts as having been up.
    expect(pass([marked])).toBe(true)
  })

  it("still evaluates unmarked siblings against live state", () => {
    const marked = { target: "target", value: "Soulbreak", resolveAt: "skillStart" }
    expect(pass([marked, { target: "self", value: "SoulReturn" }])).toBe(true)
    expect(pass([marked, { target: "self", value: "NotPresent" }])).toBe(false)
  })

  it("falls back to live state when no start state is supplied", () => {
    const empty = effects({})
    expect(
      requirementsPass(
        [{ target: "target", value: "Soulbreak", resolveAt: "skillStart" }],
        empty,
        empty,
        [],
        new Set<string>(),
        [],
        {},
        {},
      ),
    ).toBe(false)
  })
})
