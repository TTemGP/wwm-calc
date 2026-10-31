import { describe, expect, it } from "vitest"

import {
  buildRotationTimeline,
  type TimelineBuildInput,
  type TimelineActionResolverFactory,
} from "@/calculations/rotationTimeline"

const grant = {
  event: "skillEnd",
  requirement: [{ target: "skillTag", value: "MartialArt" }],
  action: { type: "apply", target: "self", value: "Ready", stack: 5 },
}

function input(): TimelineBuildInput {
  return {
    rotation: {
      name: "Completion",
      ping: 0,
      steps: [
        { type: "skill", skill: "Q" },
        { type: "skill", skill: "Hit" },
      ],
    },
    skills: {
      Q: {
        castTime: 2,
        tags: ["MartialArt"],
        action: [
          { type: "damage", phyCoef: 1, time: 1 },
          { type: "damage", phyCoef: 1, time: 2 },
        ],
      },
      Hit: { castTime: 1, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
    },
    effectDefinitions: { Ready: { maxStack: 5, duration: 12 } },
    setupEffects: [],
    innerWayRules: [{ source: "Completion", tier: 6, effect: {}, trigger: grant }],
    innerWayConditions: [],
    weapons: [],
    eventDefinitions: {},
    dots: {},
  }
}

describe("shared skillEnd triggers", () => {
  it("grants stacks after the final hit and before the next cast, without adding a displayed action", () => {
    const rows = buildRotationTimeline(input())
    expect(rows[0].actionStates[0].buffs.has("Ready")).toBe(false)
    expect(rows[0].actionStates[1].buffs.has("Ready")).toBe(false)
    expect(rows[1].actionStates[0].buffs.get("Ready")).toMatchObject({ stack: 5, expiresAt: 14 })
    expect(rows[0].actions).toHaveLength(2)
  })

  it("uses the modified cast duration, including ping", () => {
    const data = input()
    data.rotation.ping = 40
    data.skills.Q.modifier = [{ effect: { castTimeMultiplier: 0.5 } }]
    const rows = buildRotationTimeline(data)
    expect(rows[0].effectiveCastTime).toBe(1)
    expect(rows[1].buffs.get("Ready")?.expiresAt).toBeCloseTo(13.04, 9)
  })

  it("supports setup and owned buff triggers with live end-of-cast requirements", () => {
    const data = input()
    data.innerWayRules = []
    data.setupEffects = [{ trigger: { ...grant, requirement: [{ target: "self", value: "Gate" }] } }]
    data.effectDefinitions.Gate = { trigger: { ...grant, action: { type: "addResource", value: "Count", amount: 1 } } }
    data.skills.Q.action = [{ type: "apply", target: "self", value: "Gate", time: 2 }]
    const rows = buildRotationTimeline(data)
    expect(rows[1].buffs.has("Ready")).toBe(true)
    expect(rows[1].resources.Count).toBe(1)
  })

  it("retains the shared Inner Way proc cooldown across casts", () => {
    const data = input()
    data.innerWayRules[0].trigger = {
      ...grant,
      cooldown: 15,
      action: { type: "addResource", value: "Count", amount: 1 },
    }
    data.rotation.steps = [
      { type: "skill", skill: "Q" },
      { type: "skill", skill: "Q" },
      { type: "event", event: "Delay", duration: 13 },
      { type: "skill", skill: "Q" },
      { type: "skill", skill: "Hit" },
    ]
    const rows = buildRotationTimeline(data)
    expect(rows.at(-1)?.resources.Count).toBe(2)
  })

  it("fires once for a composite cast at the resolved completion time", () => {
    const data = input()
    data.skills.Q = { castTime: 0, tags: ["MartialArt"], subAction: ["Part", "Part"] }
    data.skills.Part = { castTime: 1, action: [{ type: "damage", phyCoef: 1, time: 1 }] }
    data.innerWayRules[0].trigger = { ...grant, action: { type: "addResource", value: "Count", amount: 1 } }
    const rows = buildRotationTimeline(data)
    expect(rows[0].actionStates[1].resources.Count ?? 0).toBe(0)
    expect(rows[1].resources.Count).toBe(1)
    expect(rows[1].startTime).toBe(2)
  })

  it("preserves the existing resolver callback while also dispatching ordinary triggers", () => {
    const completed: number[] = []
    const rows = buildRotationTimeline(input(), undefined, () =>
      Object.assign((() => undefined) as ReturnType<TimelineActionResolverFactory>, {
        onCastEnd: (row: { startTime: number; effectiveCastTime: number }) =>
          completed.push(row.startTime + row.effectiveCastTime),
      }),
    )
    expect(completed).toEqual([2, 3])
    expect(rows[1].buffs.has("Ready")).toBe(true)
  })

  it("moves completion with a queued continuation and fires only once", () => {
    const data = input()
    data.skills.Q = {
      castTime: 1,
      tags: ["MartialArt"],
      action: [{ type: "trigger", value: "Child", queueTime: 0.5, time: 0.8 }],
    }
    data.skills.Child = { castTime: 2, tags: ["Triggered"], action: [{ type: "damage", phyCoef: 1, time: 2 }] }
    data.innerWayRules[0].trigger = { ...grant, action: { type: "addResource", value: "Count", amount: 1 } }
    const rows = buildRotationTimeline(data)
    const next = rows.find(row => row.step.type === "skill" && row.step.skill === "Hit")!
    expect(next.startTime).toBeCloseTo(2.8, 9)
    expect(next.resources.Count).toBe(1)
    const child = rows.find(row => row.step.type === "skill" && row.step.skill === "Child")!
    expect(child.actionStates[0].resources.Count ?? 0).toBe(0)
  })

  it("does not complete a cast interrupted by Battle End", () => {
    const data = input()
    data.rotation.steps.push({ type: "event", event: "BattleEnd", startTime: 1.5 })
    data.innerWayRules[0].trigger = { ...grant, action: { type: "trigger", value: "Proc" } }
    data.skills.Proc = { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] }
    const rows = buildRotationTimeline(data)
    expect(rows.some(row => row.step.type === "skill" && row.step.skill === "Proc")).toBe(false)
  })

  it("does not treat a triggered child's inherited damage tags as its cast identity", () => {
    const data = input()
    data.skills.Q.action = [{ type: "trigger", value: "Child", time: 0 }]
    data.skills.Child = { castTime: 0.5, tags: ["Triggered"], action: [{ type: "damage", phyCoef: 1, time: 0.5 }] }
    data.innerWayRules[0].trigger = { ...grant, action: { type: "addResource", value: "Count", amount: 1 } }
    const rows = buildRotationTimeline(data)
    expect(rows.find(row => row.step.type === "skill" && row.step.skill === "Hit")?.resources.Count).toBe(1)
  })
})
