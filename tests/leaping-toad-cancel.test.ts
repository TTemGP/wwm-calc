import buffs from "@gamedata/buff/mystic.json"
import debuffs from "@gamedata/debuff/mystic.json"
import general from "@gamedata/skill/general.json"
import mystic from "@gamedata/skill/mystic.json"
import { expect, it } from "vitest"

import { buildRotationTimeline } from "@/calculations/rotationTimeline"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

it("starts Deflect at the Toad lunge hit without losing damage or venom", () => {
  const timeline = buildRotationTimeline({
    rotation: {
      name: "Toad cancel",
      ping: 40,
      steps: [
        { type: "skill", skill: "LeapingToad" },
        { type: "skill", skill: "Deflect" },
      ],
    },
    skills: asSkillRecords({ ...mystic, ...general }),
    effectDefinitions: asEffectDefinitions({ ...buffs, ...debuffs }),
    eventDefinitions: {},
    dots: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
    initialResources: { Vitality: 100 },
    resourceMaximums: { Vitality: 100 },
  })
  const toad = timeline.find(row => row.step.skill === "LeapingToad")!
  const deflect = timeline.find(row => row.step.skill === "Deflect")!
  const hits = toad.actions.filter(action => action.type === "damage")
  expect(hits).toHaveLength(2)
  expect(deflect.startTime - toad.startTime).toBeCloseTo(1.15, 12)
  expect(deflect.startTime).toBeCloseTo(toad.startTime + Number(hits[1].time), 12)
  expect(deflect.debuffs.has("ToadVenom")).toBe(true)
})
