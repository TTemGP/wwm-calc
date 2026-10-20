import { assert, expect, it } from "vitest"

import paths from "../data/path.json"
import preset from "../data/rotation/stonesplit-might/dummy-1-min.json"
import { buildPresetRotationBundle } from "../src/application/graduation"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { type RotationRecord } from "../src/calculations/rotationTimeline"
import { dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"
it("Might holds Defense through the intended dummy pairs and stores two Cadence stacks", () => {
  const bundle = buildPresetRotationBundle(
    {
      ...dpsSnapshotEnvironment,
      pathId: "stonesplitMight",
      martialArts: ["thundercry", "stormbreaker"],
      rotation: preset as RotationRecord,
      skillOverrides: {},
      previewId: null,
    },
    paths.stonesplitMight.defaultBuild,
  )!
  const { timeline, metrics } = calculateRotationBaseline(bundle)
  const defenses = timeline.filter(row => row.step.type === "skill" && row.step.skill === "Defense")
  expect(defenses.length).toBe(preset.steps.filter(step => step.skill === "Defense").length)
  expect(metrics.dps).toBeGreaterThan(0)
  const anchor = timeline.find(row => row.rotationIndex === preset.start.step)!
  const battleStart = anchor.startTime + Number(anchor.actions[preset.start.action].time)
  const openingHits = anchor.actions.filter(action => action.type === "damage")
  expect(anchor.startTime + Number(openingHits[0].time)).toBeCloseTo(battleStart, 8)
  expect(anchor.startTime + Number(openingHits[1].time)).toBeGreaterThan(battleStart)
  expect(defenses.map(row => Number((row.startTime + row.effectiveCastTime - battleStart - 0.1).toFixed(5)))).toEqual([
    5.5, 17.5, 23.5, 29.5, 41.5, 53.5,
  ])
  const attacks = timeline.filter(row => row.step.type === "event" && row.step.event === "TakeDamage")
  expect(attacks).toHaveLength(20)
  for (const defense of defenses) {
    const successes = timeline.filter(
      row => row.step.type === "skill" && row.step.skill === "DefenseSuccess" && row.sourceRowId === defense.id,
    )
    expect(successes).toHaveLength(2)
    expect(successes[0].startTime).toBe(successes[1].startTime)
    expect(defense.startTime).toBeLessThan(successes[0].startTime)
    expect(defense.startTime + defense.effectiveCastTime).toBeCloseTo(successes[0].startTime + 0.1, 5)
    const pair = attacks.filter(row => row.startTime === successes[0].startTime)
    expect(pair).toHaveLength(2)
    expect(pair.flatMap(row => row.actions.map(action => action.damage))).toEqual([0, 0])
    const next = timeline.find(
      row => row.kind === "rotation" && row.step.type === "skill" && row.rotationIndex! > defense.rotationIndex!,
    )
    expect(next?.buffs.get("Cadence")?.stack).toBe(2)
    // Later defenses can occur during the cooldown of a stored-Cadence conversion.
    if (defense === defenses[0]) assert(next?.buffs.has("Riposte"))
  }
  expect(
    timeline.some(row => row.step.type === "event" && row.step.event === "Buff" && row.step.buff === "Cadence"),
  ).toBe(false)
  expect(timeline.some(row => row.step.type === "event" && row.step.event === "Delay" && !row.step.automatic)).toBe(
    false,
  )
})
