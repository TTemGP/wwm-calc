import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"

it("preserves WTS proc counts and downstream timing after the Floating Grace interrupt refresh", async () => {
  const cases = (await loadDpsSnapshotCases()).filter(
    entry =>
      (entry.id.includes("/dummy-1-min-wts/") || entry.id.includes("/dummy-1-min-wts-team/")) &&
      entry.fixture.build === "deluge-fully-relayed-max-hw",
  )
  expect(cases).toHaveLength(4)
  for (const { pathId, rotation, fixture } of cases) {
    const bundle = buildPresetRotationBundle(
      { pathId, ...fixture, rotation: { ...rotation, ping: fixture.ping }, skillOverrides: {}, previewId: null },
      fixture.build,
    )!
    const control = structuredClone(bundle)
    // Reconstruct the previous schedule with the same coefficients and setup.
    control.timeline.rotation.steps = control.timeline.rotation.steps.filter(
      (step, index, steps) =>
        !(step.type === "event" && step.event === "Delay" && steps[index - 1]?.skill === "FloatingGrace"),
    )
    const grace = control.timeline.skills.FloatingGrace
    grace.castTime = 1.15
    for (const action of grace.action ?? [])
      if (action && typeof action === "object" && "time" in action && action.time === 1) action.time = 0.975
    const before = calculateRotationBaseline(control)
    const after = calculateRotationBaseline(bundle)
    const hitCounts = (result: typeof after) =>
      result.metrics.breakdown.skills.map(skill => [skill.id, skill.hits]).sort()
    const casts = (result: typeof after) =>
      result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(hitCounts(after)).toEqual(hitCounts(before))
    expect(after.metrics.dps).toBeCloseTo(before.metrics.dps, 8)
    const previousCasts = casts(before)
    for (const [index, row] of casts(after).entries()) {
      expect(row.step.skill).toBe(previousCasts[index].step.skill)
      expect(row.startTime - after.anchorTime).toBeCloseTo(previousCasts[index].startTime - before.anchorTime, 8)
    }
  }
})
