import { describe, expect, it } from "vitest"

import { buffDefinitions } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateRotationBaseline, type RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { EditableObject } from "@/calculations/rotationTimeline"
import { effectForSoloLevel } from "@/data/soloLevelEffects"
import { emptyStats } from "@/data/statDefinitions"
import { weaponSetDefinitions } from "@/gear"

function bundle(pieces: number): RotationSimulationBundle {
  const setup = effectForSoloLevel(
    weaponSetDefinitions.Mistwillow.options[pieces].effect as EditableObject,
    17,
    "Mistwillow",
  )
  return {
    stats: { ...emptyStats, minPhys: 100, maxPhys: 100, minSilkbind: 100, maxSilkbind: 100, precision: 1 },
    enemy: {
      name: "Mistwillow target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    weapons: ["vernalUmbrella", "inkwellFan"],
    attunement: emptyAttunementStats,
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
    timeline: {
      weapons: ["vernalUmbrella", "inkwellFan"],
      setupEffects: [setup],
      innerWayRules: [],
      innerWayConditions: [],
      dots: {},
      eventDefinitions: {},
      effectDefinitions: buffDefinitions,
      skills: Object.fromEntries(
        ["Heavy", "Light", "Ballistic", "Special"].map(tag => [
          tag,
          {
            castTime: 1,
            tags: ["DirectDamage", "MartialArts", "Umbrella", tag],
            action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }],
          },
        ]),
      ),
      rotation: {
        name: "Mistwillow sequence",
        steps: [
          ...["Heavy", "Heavy", "Light", "Ballistic", "Special", "Heavy"].map(skill => ({
            type: "skill" as const,
            skill,
          })),
          { type: "event", event: "Delay", duration: 14.1 },
          { type: "skill", skill: "Special" },
        ],
      },
    },
  }
}

describe("Mistwillow", () => {
  it("grants the opposite category, upgrades once, and refreshes only on eligible hits outside its cooldown", () => {
    const result = calculateRotationBaseline(bundle(4))
    const baseline = calculateRotationBaseline(bundle(2))
    for (const index of [0, 1, 4, 7]) {
      expect(result.actionBreakdowns[`rotation-${index}:0`].total).toBe(
        baseline.actionBreakdowns[`rotation-${index}:0`].total,
      )
    }
    for (const index of [2, 3, 5]) {
      const hit = result.actionBreakdowns[`rotation-${index}:0`]
      const original = baseline.actionBreakdowns[`rotation-${index}:0`]
      expect(hit.physical).toBeCloseTo(original.physical * 1.1)
      expect(hit.silkbind).toBeCloseTo(original.silkbind * 1.1)
    }
    const row = (index: number) => result.timeline.find(item => item.id === `rotation-${index}`)!
    expect(row(1).actionStates[0].buffs.get("MistwillowGracefulWillow")?.expiresAt).toBe(15)
    expect(row(3).actionStates[0].buffs.get("Mistwillow")?.expiresAt).toBe(17)
    expect(row(4).actionStates[0].buffs.get("Mistwillow")?.expiresAt).toBe(17)
    expect(row(5).actionStates[0].buffs.has("MistwillowGracefulWillow")).toBe(false)
    expect(row(5).actionStates[0].buffs.has("MistwillowDenseSmoke")).toBe(false)
    expect(row(7).actionStates[0].buffs.has("Mistwillow")).toBe(false)
  })

  it("lets Light and Ballistic open the Heavy bonus without boosting their own opening hits", () => {
    for (const first of ["Light", "Ballistic"]) {
      const input = bundle(4)
      input.timeline.rotation.steps = [
        { type: "skill", skill: first },
        { type: "skill", skill: "Heavy" },
      ]
      const result = calculateRotationBaseline(input)
      expect(result.actionBreakdowns["rotation-1:0"].total).toBeCloseTo(
        result.actionBreakdowns["rotation-0:0"].total * 1.1,
      )
    }
  })
})
