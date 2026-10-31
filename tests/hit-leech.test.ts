import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import {
  calculateRotationBaseline,
  calculateRotationSimulation,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { emptyStats } from "@/data/statDefinitions"

function bundle(): RotationSimulationBundle {
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, maxHp: 100, precision: 1 }
  return {
    stats,
    attunement: emptyAttunementStats,
    enemy: {
      name: "Leech target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    weapons: ["inkwellFan", "vernalUmbrella"],
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
    timeline: {
      rotation: { name: "Leech", steps: [{ type: "skill", skill: "Hits" }] },
      skills: {
        Hits: {
          castTime: 4,
          tags: ["DirectDamage"],
          action: [
            { type: "setHP", currentHP: 70, time: 0 },
            { type: "damage", phyCoef: 1, time: 1 },
            { type: "damage", phyCoef: 1, time: 2 },
            { type: "damage", phyCoef: 1, time: 3 },
          ],
        },
      },
      effectDefinitions: {},
      dots: {},
      eventDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      weapons: ["inkwellFan", "vernalUmbrella"],
      maxHP: 100,
      setupEffects: [
        { requirement: [{ target: "selfHPPercentage", comparison: "<=", amount: 75 }], effect: { leech: 0.1 } },
      ],
    },
  }
}

describe("hit-based leech", () => {
  it("uses final damage and updates HP before the next hit rechecks its condition", () => {
    const result = calculateRotationBaseline(bundle())
    const first = result.actionBreakdowns["rotation-0:1"]
    expect(first.selfRecovery).toBeCloseTo(first.total * 0.1)
    expect(result.actionBreakdowns["rotation-0:2"].selfRecovery).toBeUndefined()
    expect(result.timeline[0].actionStates[2].currentHP).toBeCloseTo(70 + first.selfRecovery!)
  })

  it("adds independent sources, clamps actual HP, and does not turn leech into a healing skill", () => {
    const input = bundle()
    input.timeline.setupEffects = [{ effect: { leech: 0.1 } }]
    input.timeline.effectDefinitions.Leech = { maxStack: 1, effect: [{ effect: { leech: 0.2 } }] }
    input.timeline.initialBuffs = [{ name: "Leech", stack: 1 }]
    const result = calculateRotationBaseline(input)
    const first = result.actionBreakdowns["rotation-0:1"]
    expect(first.selfRecovery).toBeCloseTo(first.total * 0.3)
    expect(result.timeline[0].actionStates[2].currentHP).toBe(100)
    expect(result.metrics.totalHealing).toBe(0)
  })

  it("uses the sampled hit's damage in simulation", () => {
    const input = bundle()
    input.stats.crit = 0.8
    input.stats.critDmgBonus = 0.5
    const result = calculateSimulatedRotationRun(input, () => 0.5)
    const first = result.resolvedSequence[0]
    expect(first.selfRecovery).toBeCloseTo(first.breakdown.total * 0.1)
    expect(result.resolvedSequence[1].entry.context.currentHPRatio).toBeCloseTo((70 + first.selfRecovery!) / 100)
  })

  it("rebuilds comparisons when changed damage crosses an HP threshold through leech", () => {
    const input = bundle()
    input.timeline.setupEffects.push({
      requirement: [{ target: "selfHPPercentage", comparison: ">", amount: 75 }],
      effect: { hpDMGBonus: 1 },
    })
    const weaker = { ...input.stats, minPhys: 10, maxPhys: 10 }
    input.statPriority = [{ label: "weaker", stats: weaker }]
    const result = calculateRotationSimulation(input)
    const independent = calculateRotationBaseline({ ...input, stats: weaker, statPriority: [] })
    expect(result.metrics.statPriority[0].dpsDifference).toBeCloseTo(independent.metrics.dps - result.metrics.dps)
  })
})
