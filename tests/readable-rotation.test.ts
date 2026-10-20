import { describe, expect, it } from "vitest"

import type { TimelineRow } from "../src/calculations/rotationTimeline"
import { readableRotationText } from "../src/readableRotation"

// Ported from script/probe/check-readable-rotation.mjs.
function skillRow(
  index: number,
  startTime: number,
  castTime: number,
  shortName: string,
  actions = [{ type: "damage", time: castTime }],
) {
  return {
    id: `rotation-${index}`,
    kind: "rotation",
    rotationIndex: index,
    order: index * 1000,
    step: { type: "skill", skill: `Skill${index}` },
    startTime,
    effectiveCastTime: castTime,
    skill: { name: `Skill ${index}`, shortName },
    actions,
    buffs: new Map(),
    debuffs: new Map(),
    modifierEffects: [],
    actionStates: {},
  }
}

describe("readableRotationText", () => {
  const timeline = [
    skillRow(0, 0, 1, "One"),
    skillRow(1, 1, 2, "Two", [
      { type: "damage", time: 0.5 },
      { type: "damage", time: 1 },
      { type: "damage", time: 1 },
    ]),
    skillRow(2, 3, 1, "Three"),
    skillRow(3, 4, 1, "Four"),
    {
      id: "rotation-4",
      kind: "rotation",
      rotationIndex: 4,
      order: 4000,
      step: { type: "event", event: "Qi", after: { action: 0 }, targetQiRatio: 0 },
      startTime: 3.5,
      effectiveCastTime: 0,
      skill: {},
      actions: [],
      buffs: new Map(),
      debuffs: new Map(),
      modifierEffects: [],
      actionStates: {},
    },
  ] as unknown as TimelineRow[]

  it("formats action-level anchors with hit modifiers", () => {
    expect(readableRotationText(timeline, { rowId: "rotation-1", actionIndex: 2 }, 2)).toBe(
      "One at 2 > Two (start at hit 3) > Three (break) > Four",
    )
  })

  it("formats skill-level anchors with the start modifier", () => {
    expect(readableRotationText(timeline, { rowId: "rotation-1" }, 1)).toBe(
      "One at 1 > Two (start) > Three (break) > Four",
    )
  })

  it("collapses consecutive identical skills without merging later occurrences", () => {
    const repeatedTimeline = [
      skillRow(0, 0, 1, "One"),
      skillRow(1, 1, 1, "One"),
      skillRow(2, 2, 1, "One"),
      skillRow(3, 3, 1, "Two"),
      skillRow(4, 4, 1, "One"),
    ] as unknown as TimelineRow[]

    expect(readableRotationText(repeatedTimeline, { rowId: "missing" }, 0)).toBe("One x3 > Two > One")
    expect(readableRotationText(repeatedTimeline, { rowId: "rotation-1" }, 1)).toBe(
      "One at 1 > One (start) > One > Two > One",
    )
  })
})
