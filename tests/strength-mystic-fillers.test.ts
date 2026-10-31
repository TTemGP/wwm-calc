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
      expect(Math.abs(next.startTime - row.startTime - row.effectiveCastTime)).toBeLessThan(1e-9)
      expect(row.actions.filter(action => action.type === "damage")).toHaveLength(2)
    }
    const toadDeflectBurstingNine = casts.some(
      (row, index) =>
        row.step.skill === "LeapingToad" &&
        casts[index + 1]?.step.skill === "Deflect" &&
        casts[index + 2]?.step.skill === "BurstingNine2Shots7Hits",
    )
    expect(toadDeflectBurstingNine).toBe(true)
    const charges = casts.filter(row => row.step.skill === "PhalanxbaneHeavyCharged3")
    expect(charges).toHaveLength(15)
    expect(result.baseline.filter(hit => hit.context.skillTags.includes("BurningHeart"))).toHaveLength(30)
    expect(charges.at(-1)!.startTime + charges.at(-1)!.effectiveCastTime - result.anchorTime).toBeLessThan(60)
    const arrows = result.metrics.breakdown.skills.find(skill => skill.id === "BurstingNine2Shots7Hits")
    expect(arrows?.casts).toBe(1)
    expect(arrows?.hits).toBe(14)
    expect(result.duration).toBeCloseTo(60, 10)
  }
})

it("Main Mixed's earlier Bursting Nine lands every arrow under Iron Guard", async () => {
  const entry = (await loadDpsSnapshotCases()).find(
    candidate =>
      candidate.pathId === "stonesplitStrength" &&
      candidate.fixture.rotation === "mixed-dummy-1-min" &&
      candidate.fixture.build === "mixed-full-min" &&
      candidate.fixture.breakthrough === "18",
  )!
  const bundle = buildPresetRotationBundle(
    { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {}, previewId: null },
    entry.fixture.build,
  )!
  const result = calculateRotationBaseline(bundle)
  const arrows = result.baseline.filter(hit => hit.context.skillTags.includes("BurstingNine"))
  expect(arrows).toHaveLength(14)
  expect(arrows.every(hit => hit.context.buffs.includes("IronGuard"))).toBe(true)
})

it("Main Mixed ends Tab, VC, Mo QQ with the final linked VC hit before 60 seconds", async () => {
  const entry = (await loadDpsSnapshotCases()).find(
    candidate =>
      candidate.pathId === "stonesplitStrength" &&
      candidate.fixture.rotation === "mixed-dummy-1-min" &&
      candidate.fixture.build === "mixed-full-min" &&
      candidate.fixture.breakthrough === "18",
  )!
  const bundle = buildPresetRotationBundle(
    { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {}, previewId: null },
    entry.fixture.build,
  )!
  const result = calculateRotationBaseline(bundle)
  const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill" && !row.skipped)
  expect(casts.slice(-3).map(row => row.step.skill)).toEqual([
    "SnowpartingConversion",
    "SnowpartingHeavyVC",
    "PhalanxbaneQ",
  ])
  const linkedVcHits = result.baseline.filter(
    hit =>
      hit.context.skillTags.includes("AnxiSoldier") &&
      hit.context.skillTags.includes("HengBlade") &&
      hit.context.skillTags.includes("VariedCombo"),
  )
  expect(linkedVcHits).toHaveLength(16)
  expect(Math.max(...linkedVcHits.map(hit => hit.timelineTime! - result.anchorTime))).toBeLessThan(60)
})

it("Double Stab's final Tab VC LC lands its direct hits before 59.9 seconds", async () => {
  const entry = (await loadDpsSnapshotCases()).find(
    candidate =>
      candidate.pathId === "stonesplitStrength" &&
      candidate.fixture.rotation === "mixed-dummy-1-min-double-stab" &&
      candidate.fixture.build === "mixed-full-min" &&
      candidate.fixture.breakthrough === "18",
  )!
  const bundle = buildPresetRotationBundle(
    { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {}, previewId: null },
    entry.fixture.build,
  )!
  const result = calculateRotationBaseline(bundle)
  const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill" && !row.skipped)
  expect(casts.filter(row => row.step.skill === "FluteOfTheTidesCancel")).toHaveLength(2)
  expect(result.metrics.breakdown.skills.find(skill => skill.id === "SnowpartingLightCharged")?.casts).toBe(2)
  expect(result.metrics.breakdown.skills.find(skill => skill.id === "SnowpartingLightCharged")?.hits).toBe(7)
  expect(result.metrics.breakdown.skills.find(skill => skill.id === "SnowpartingHeavyVC")?.casts).toBe(3)
  expect(casts.slice(-3).map(row => row.step.skill)).toEqual([
    "SnowpartingConversion",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
  ])
  const finalVc = casts.findLast(row => row.step.skill === "SnowpartingHeavyVC")!
  const vcHit = finalVc.actions.find(action => action.type === "damage")!
  expect(finalVc.startTime + Number(vcHit.time) - result.anchorTime).toBeLessThanOrEqual(59.5)
  const lastDirectHit = Math.max(
    ...result.baseline
      .filter(entry => !entry.context.skillTags.includes("DOT"))
      .map(entry => entry.timelineTime! - result.anchorTime),
  )
  expect(lastDirectHit).toBeLessThanOrEqual(59.9)
})
