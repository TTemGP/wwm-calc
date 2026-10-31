import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type TimelineBuildInput, type RotationStep } from "@/calculations/rotationTimeline"
const cast = (skill: string): RotationStep => ({ type: "skill", skill })
function input(extra: RotationStep[] = [], action: unknown[] = []): TimelineBuildInput {
  return {
    rotation: {
      name: "Sequential charges",
      ping: 0,
      steps: [cast("Q"), cast("Q"), cast("Q"), ...extra, cast("Q"), cast("Q"), cast("Q")],
    },
    skills: {
      Q: { castTime: 0, cooldown: 15, cooldownUses: 3, cooldownRecovery: "sequential", action: [] },
      Reduce: { castTime: 0, action },
    },
    effectDefinitions: {},
    eventDefinitions: {},
    dots: {},
    setupEffects: [],
    innerWayRules: [],
    innerWayConditions: [],
    weapons: [],
  }
}
describe("sequential charge recovery", () => {
  it("recovers depleted charges one at a time", () => {
    expect(
      buildRotationTimeline(input())
        .filter(r => r.step.skill === "Q")
        .map(r => r.startTime),
    ).toEqual([0, 0, 0, 15, 30, 45])
  })
  it.each([
    [5, [0, 0, 0, 10, 25, 40]],
    [20, [0, 0, 0, 5, 20, 35]],
  ])("reduces only the active timer by %s seconds", (seconds, expected) => {
    const data = input(
      [{ type: "event", event: "Delay", duration: 5 }, cast("Reduce")],
      [{ type: "clearCD", value: "Q", seconds, time: 0 }],
    )
    expect(
      buildRotationTimeline(data)
        .filter(r => r.step.skill === "Q")
        .map(r => r.startTime),
    ).toEqual(expected)
  })
  it("starts the next recharge immediately when one charge is restored", () => {
    const data = input(
      [{ type: "event", event: "Delay", duration: 5 }, cast("Reduce")],
      [{ type: "clearCD", value: "Q", charges: 1, time: 0 }],
    )
    expect(
      buildRotationTimeline(data)
        .filter(r => r.step.skill === "Q")
        .map(r => r.startTime),
    ).toEqual([0, 0, 0, 5, 20, 35])
  })
})
