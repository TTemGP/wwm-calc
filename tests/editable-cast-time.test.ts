import { expect, it } from "vitest"

import { resolveSkillStepDuration } from "../src/calculations/rotationTimeline"
import { deserializeSkillOverrides, serializeSkillOverrides } from "../src/skillOverrides"

it("keeps boolean cast-time editing unbounded and honors bounded duration options", () => {
  const step = { type: "skill" as const, skill: "Test", duration: 20 }
  expect(resolveSkillStepDuration(step, { editableCastTime: true })).toBe(20)
  expect(resolveSkillStepDuration(step, { editableCastTime: false })).toBeUndefined()
  expect(resolveSkillStepDuration(step, {})).toBeUndefined()
  const skill = { editableCastTime: { max: 12 } }
  expect(resolveSkillStepDuration(step, skill)).toBe(12)
  expect(resolveSkillStepDuration({ ...step, duration: -2 }, skill)).toBe(0)
  expect(resolveSkillStepDuration({ type: "skill", skill: "Test" }, skill)).toBe(12)
})

it.each([true, false, { effect: "FlowerBurial", max: 12, required: true }])(
  "migrates legacy duration input %j without changing resolved step durations",
  durationInput => {
    const migrated = deserializeSkillOverrides({
      version: 3,
      overrides: { Everspring: { ScarletSpin: { editableCastTime: true, durationInput } } },
    })
    const skill = migrated.Everspring?.ScarletSpin
    expect(skill).not.toHaveProperty("durationInput")
    const expected = typeof durationInput === "object" ? 12 : 20
    expect(resolveSkillStepDuration({ type: "skill", skill: "ScarletSpin", duration: 20 }, skill)).toBe(expected)
    expect(skill?.editableCastTime).toEqual(typeof durationInput === "object" ? durationInput : true)
    expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(migrated)))).toEqual(migrated)
  },
)
