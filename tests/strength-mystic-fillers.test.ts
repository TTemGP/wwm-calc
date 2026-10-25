import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"

const rotationIds = ["mixed-dummy-1-min", "mixed-dummy-1-min-double-stab", "mixed-dummy-infinite-vitality-1-min"]

it.each(rotationIds)("%s preserves charged hits and legal follow-ups with Mystic fillers", async rotationId => {
  const fixtures = (await loadDpsSnapshotCases()).filter(
    entry =>
      entry.pathId === "stonesplitStrength" &&
      entry.fixture.rotation === rotationId &&
      entry.fixture.build.startsWith("mixed-"),
  )
  expect(fixtures).toHaveLength(8)
  for (const entry of fixtures) {
    const bundle = buildPresetRotationBundle(
      { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {}, previewId: null },
      entry.fixture.build,
    )!
    const result = calculateRotationBaseline(bundle)
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill" && !row.skipped)
    const neighbors = casts.map((row, index) => ({ row, previous: casts[index - 1], next: casts[index + 1] }))
    for (const { previous } of neighbors.filter(({ row }) => row.step.skill === "SnowpartingHeavyVC")) {
      expect(["SnowpartingConversion", "SnowpartingLightCharged"]).toContain(previous?.step.skill)
    }
    for (const { previous } of neighbors.filter(({ row }) => row.step.skill === "SnowpartingConversion")) {
      expect(bundle.timeline.skills[previous.step.skill!].tags).toContain("MoBlade")
    }
    for (const { row, next } of neighbors.filter(({ row }) => row.step.skill === "LeapingToad")) {
      expect(next?.step.skill).toBe("Deflect")
      expect(next.startTime).toBeCloseTo(row.startTime + row.effectiveCastTime, 10)
      expect(row.actions.filter(action => action.type === "damage")).toHaveLength(2)
    }
    const charges = casts.filter(row => row.step.skill === "PhalanxbaneHeavyCharged3")
    expect(charges).toHaveLength(15)
    expect(result.baseline.filter(hit => hit.context.skillTags.includes("BurningHeart"))).toHaveLength(30)
    expect(charges.at(-1)!.startTime + charges.at(-1)!.effectiveCastTime - result.anchorTime).toBeLessThan(60)
    const arrows = result.metrics.breakdown.skills.find(skill => skill.id === "BurstingNine2Shots7Hits")!
    expect(arrows.casts).toBe(1)
    expect(arrows.hits).toBe(14)
    expect(result.duration).toBeCloseTo(60, 10)
  }
})
