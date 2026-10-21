import mechanism from "@gamedata/skill/mechanism.json"
import snowparting from "@gamedata/skill/snowparting-blade.json"
import soulshade from "@gamedata/skill/soulshade-umbrella.json"
import stormbreaker from "@gamedata/skill/stormbreaker-spear.json"
import { expect, it } from "vitest"

import { buildRotationTimeline } from "@/calculations/rotationTimeline"

import { asSkillRecords } from "./helpers/shippedData"

function build(skill: string, effect: string) {
  return buildRotationTimeline({
    rotation: {
      name: "Refreshed timing",
      ping: 0,
      steps: [
        { type: "skill", skill },
        { type: "skill", skill: "Observe" },
      ],
    },
    skills: asSkillRecords({
      ...mechanism,
      ...snowparting,
      ...soulshade,
      ...stormbreaker,
      Observe: { castTime: 0, action: [] },
    }),
    effectDefinitions: { [effect]: { duration: 10, effect: [] } },
    eventDefinitions: {},
    dots: {},
    weapons: [],
    setupEffects: [],
    innerWayConditions: [],
    innerWayRules: [],
  })
}

it.each([
  { skill: "StormRoar", effect: "Drumbeat", target: "buffs", appliedAt: 0.6, nextCast: 0.9 },
  { skill: "FloatingGrace", effect: "FloatingGrace", target: "buffs", appliedAt: 1, nextCast: 1.1 },
  { skill: "SummonLightning", effect: "ThunderSummoning", target: "buffs", appliedAt: 0.403, nextCast: 1.179 },
  { skill: "SnowpartingSpecial", effect: "Dread", target: "debuffs", appliedAt: 2.066, nextCast: 2.066 },
] as const)("$skill preserves its effect application before the next ordinary cast", entry => {
  const rows = build(entry.skill, entry.effect)
  const follow = rows.find(row => row.step.skill === "Observe")!
  expect(follow.startTime).toBeCloseTo(entry.nextCast, 10)
  expect(follow[entry.target].get(entry.effect)?.appliedAt).toBeCloseTo(entry.appliedAt, 10)
})

it("resolves every Fleeting Trace hit before its cast-end Dread application", () => {
  const rows = build("SnowpartingSpecial", "Dread")
  const cast = rows.find(row => row.step.skill === "SnowpartingSpecial")!
  const damage = cast.actions.flatMap((action, index) => (action.type === "damage" ? [{ action, index }] : []))
  expect(damage).toHaveLength(9)
  expect(Number(damage[0].action.time)).toBeCloseTo(0.8473957101428573, 10)
  expect(Number(damage[8].action.time)).toBeCloseTo(2.014537337142857, 10)
  for (const { index } of damage) expect(cast.actionStates[index].debuffs.has("Dread")).toBe(false)
})
