import { expect, it } from "vitest"

import {
  buildRotationTimeline,
  expandedSkillActionLayout,
  type SkillRecord,
} from "../src/calculations/rotationTimeline"

it("reserves fallback sequence actions so later action anchors match the simulated slots", () => {
  const skills: Record<string, SkillRecord> = {
    Parent: { castTime: 0, action: [], subAction: [{ value: ["Primary"], fallback: ["Fallback"] }, "Tail"] },
    Primary: { castTime: 1, action: [{ type: "damage", time: 0.2 }] },
    Fallback: {
      castTime: 1,
      action: [
        { type: "damage", time: 0.3 },
        { type: "damage", time: 0.8 },
      ],
    },
    Tail: { castTime: 1, action: [{ type: "damage", time: 0.4 }] },
  }
  const layout = expandedSkillActionLayout("Parent", skills)
  const rows = buildRotationTimeline({
    rotation: { name: "Composite", steps: [{ type: "skill", skill: "Parent" }] },
    skills,
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  })
  const parent = rows.find(row => row.kind === "rotation")!
  expect(layout.actionTimes).toEqual([0.2, 0.8, 1.4])
  expect(parent.actions).toHaveLength(layout.actionTimes.length)
  expect(parent.actions[2].time).toBeCloseTo(layout.actionTimes[2])
  expect(layout.castTime).toBe(2)
})
