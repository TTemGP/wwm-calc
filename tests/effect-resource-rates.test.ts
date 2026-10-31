import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type EditableObject, type EffectDefinition } from "@/calculations/rotationTimeline"

const hit = (time: number): EditableObject => ({ type: "damage", phyCoef: 1, time })
const mode: EffectDefinition = {
  name: "Mode",
  resourceRates: [
    {
      resource: "Blossoms",
      regeneration: 0,
      consumption: 10,
      onDepleted: [
        { type: "consume", target: "self", value: "Mode", stack: "all", time: 0 },
        { type: "addResource", value: "Blossoms", amount: 15, time: 0.2 },
      ],
    },
    { resource: "Blossoms", consumption: 10, requirement: [{ target: "target", value: "Marked" }] },
  ],
  periodic: { firstTick: 0.55, interval: 0.5, action: [hit(0)] },
}

function run({
  initial = 100,
  duration = 12,
  actions = [] as EditableObject[],
  definition = mode,
  infinite = false,
} = {}) {
  return buildRotationTimeline({
    rotation: {
      name: "Buff resource drain",
      ping: 0,
      steps: [
        { type: "skill", skill: "Activate" },
        { type: "skill", skill: "Filler" },
      ],
    },
    skills: {
      Activate: { castTime: 1, action: [{ type: "apply", target: "self", value: "Mode", time: 0 }] },
      Filler: { castTime: duration - 1, action: [...actions, hit(duration - 1)] },
    },
    effectDefinitions: { Mode: definition, Marked: { duration: 2, refresh: true } },
    eventDefinitions: {},
    dots: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
    initialResources: { Blossoms: initial, Endurance: 20 },
    resourceMaximums: { Blossoms: 100, Endurance: 100 },
    resourceRegeneration: { Blossoms: 0.3, Endurance: 10 },
    infiniteResources: infinite ? ["Blossoms"] : [],
  })
}

const filler = (rows: ReturnType<typeof run>) =>
  rows.find(row => row.step.type === "skill" && row.step.skill === "Filler")!
const modeHits = (rows: ReturnType<typeof run>) =>
  rows
    .filter(row => row.step.type === "skill" && row.step.skill === "Mode")
    .flatMap(row => row.actions.filter(action => action.type === "damage").map(() => row.startTime))

describe("buff-owned resource rates", () => {
  it("drains across other casts, ends at depletion, cancels projectiles, and restores after a delay", () => {
    const rows = run()
    const end = filler(rows).actionStates[0]
    expect(end.resources.Blossoms).toBeCloseTo(15.6, 8)
    expect(end.resources.Endurance).toBe(100)
    expect(end.buffs.has("Mode")).toBe(false)
    expect(modeHits(rows).at(-1)).toBeCloseTo(9.55, 8)
    const removal = rows.find(row => row.actions.some(action => action.type === "consume" && action.value === "Mode"))!
    expect(removal.startTime).toBe(10)
  })

  it("changes drain at debuff application and expiry even between sparse events", () => {
    const rows = run({ actions: [{ type: "apply", target: "target", value: "Marked", time: 1 }] })
    // 0–2: 10/s; 2–4: 20/s; 4–8: 10/s. Mode ends at 8, not 10.
    const removal = rows.find(row => row.actions.some(action => action.type === "consume" && action.value === "Mode"))!
    expect(removal.startTime).toBe(8)
    expect(filler(rows).actionStates[1].resources.Blossoms).toBeCloseTo(16.2, 8)
  })

  it("recomputes depletion after refunds and direct spending", () => {
    for (const [type, expected] of [
      ["addResource", 11],
      ["consumeResource", 9],
    ] as const) {
      const rows = run({ actions: [{ type, value: "Blossoms", amount: 10, time: 1 }] })
      const removal = rows.find(row =>
        row.actions.some(action => action.type === "consume" && action.value === "Mode"),
      )!
      expect(removal.startTime).toBe(expected)
    }
  })

  it("resumes ordinary regeneration after manual removal and natural expiry", () => {
    const manual = run({ actions: [{ type: "consume", target: "self", value: "Mode", stack: "all", time: 1 }] })
    expect(filler(manual).actionStates[1].resources.Blossoms).toBe(83)
    const expired = run({ definition: { ...mode, duration: 2 } })
    expect(filler(expired).actionStates[0].resources.Blossoms).toBe(83)
  })

  it("does not depend on unrelated action frequency", () => {
    const whole = run({ initial: 97 })
    const split = run({ initial: 97, actions: [hit(0.1), hit(0.9), hit(3.23), hit(7.41)] })
    expect(filler(split).actionStates[4].resources.Blossoms).toBeCloseTo(
      filler(whole).actionStates[0].resources.Blossoms,
      8,
    )
    expect(modeHits(split)).toEqual(modeHits(whole))
  })

  it("ignores drain and depletion for infinite resources", () => {
    const rows = run({ infinite: true })
    expect(filler(rows).actionStates[0].resources.Blossoms).toBe(100)
    expect(filler(rows).actionStates[0].buffs.has("Mode")).toBe(true)
  })

  it("resolves expiry boundaries without relying on projectile or filler ticks", () => {
    const rows = run({
      definition: { ...mode, periodic: undefined },
      actions: [{ type: "apply", target: "target", value: "Marked", time: 1 }],
    })
    const removal = rows.find(row => row.actions.some(action => action.type === "consume" && action.value === "Mode"))!
    expect(removal.startTime).toBe(8)
    expect(filler(rows).actionStates[1].resources.Blossoms).toBeCloseTo(16.2, 8)
  })

  it("removes the mode before a projectile at the depletion boundary", () => {
    const rows = run({ initial: 25.5 })
    expect(modeHits(rows).at(-1)).toBeCloseTo(2.05, 8)
    expect(modeHits(rows)).not.toContain(2.55)
  })

  it("handles immediate depletion from a direct spend without repeated callbacks", () => {
    const rows = run({ actions: [{ type: "consumeResource", value: "Blossoms", amount: "all", time: 1 }] })
    const removals = rows.filter(row =>
      row.actions.some(action => action.type === "consume" && action.value === "Mode"),
    )
    expect(removals).toHaveLength(1)
    expect(removals[0].startTime).toBe(2)
  })
})
