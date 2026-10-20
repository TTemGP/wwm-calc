import { describe, expect, it } from "vitest"

import morale from "../data/innerway/morale-chant.json"
import { buildPresetRotationBundle } from "../src/application/graduation"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { emptyStats } from "../src/data/statDefinitions"
import { dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"

describe("Morale Chant T6", () => {
  it.each([false, true])(
    "resolves separate controlled hits without bypassing the cooldown (controlled=%s)",
    controlled => {
      const bundle = buildPresetRotationBundle(
        {
          ...dpsSnapshotEnvironment,
          pathId: "bamboocutWind",
          martialArts: ["infernalTwinblades", "mortalRopeDart"],
          rotation: { name: "Morale", steps: [] },
          skillOverrides: {},
          previewId: null,
        },
        "wind-fully-relayed-min",
      )!
      bundle.stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
      bundle.derivedStats = calculateDerivedStats(bundle.stats, 0)
      delete bundle.rawStats
      delete bundle.baseStats
      bundle.enemy = { ...bundle.enemy, defense: 0, physicalResistance: 0, judgementResistance: 0 }
      // Anchored on the preparing step, so Controlled is applied once the fight has
      // started: nothing may be put on the target during prepull.
      bundle.startAnchor = { rowId: "rotation-0" }
      bundle.timeline = {
        ...bundle.timeline,
        initialBuffs: [],
        initialDebuffs: [],
        setupEffects: [],
        innerWayConditions: ["MoraleChantT6"],
        innerWayRules: morale.effect.MoraleChantT6.trigger.map(trigger => ({
          trigger,
          effect: {},
          source: "MoraleChant",
          tier: 6,
        })),
        rotation: {
          name: "Morale",
          ping: 0,
          steps: [
            { type: "skill", skill: "Prepare" },
            { type: "skill", skill: "Hit" },
            { type: "skill", skill: "Hit" },
            { type: "event", event: "Delay", duration: 8 },
            { type: "skill", skill: "Hit" },
          ],
        },
        skills: {
          ...bundle.timeline.skills,
          Prepare: {
            castTime: 0,
            action: [
              { type: "apply", target: "self", value: "YiRiver", stack: 5, duration: 30, time: 0 },
              ...(controlled ? [{ type: "apply", target: "target", value: "Controlled", duration: 10, time: 0 }] : []),
            ],
          },
          Hit: {
            castTime: 1,
            ignorePing: true,
            tags: ["DirectDamage"],
            action: [{ type: "damage", phyCoef: 1, time: 0 }],
          },
        },
      }
      const result = calculateRotationBaseline(bundle)
      const procs = result.timeline.filter(row => row.kind !== "damageGroup" && row.step.skill === "MoraleChant")
      expect(procs.map(row => row.startTime)).toEqual([0, 10])
      const hits = procs.map(row =>
        row.actions.flatMap((_, index) => {
          const hit = result.actionBreakdowns[`${row.id}:${index}`]
          return hit ? [hit.total] : []
        }),
      )
      expect(hits[0]).toHaveLength(controlled ? 2 : 1)
      expect(hits[1]).toHaveLength(1)
      expect(hits.flat().every(damage => damage > 0)).toBe(true)
      expect(hits[0].every(damage => Math.abs(damage - hits[0][0]) < 1e-8)).toBe(true)
    },
  )
})
