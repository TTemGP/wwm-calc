import events from "@gamedata/event.json"
import vernal from "@gamedata/martial-art/vernal-umbrella.json"
import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildPresetRotationBundle } from "@/application/graduation"
import { migrateRotation } from "@/application/rotationCatalog"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import {
  buildRotationTimeline,
  type EditableObject,
  type RotationStep,
  type TimelineBuildInput,
} from "@/calculations/rotationTimeline"
import { exportRotationEntries, mergeImportedRotationEntries, serializeRotationEntries } from "@/rotationTransfer"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

const selected = ["BlossomBarrage", "StarReacher", "ThunderousBloom"].map(innerWay => ({ innerWay, tier: "T6" }))
function input(steps: RotationStep[], blossoms = 0): TimelineBuildInput {
  return {
    rotation: { name: "Jade", ping: 0, steps },
    skills: allSkillDefinitions,
    effectDefinitions,
    eventDefinitions: {},
    dots: {},
    setupEffects: [],
    innerWayRules: innerWayEffectRulesFor(selected, 19, "silkbindJade"),
    innerWayConditions: [...innerWayConditionsFor(selected, undefined, "silkbindJade")],
    weapons: ["vernalUmbrella", "inkwellFan"],
    initialResources: { Blossoms: blossoms },
    resourceMaximums: { Blossoms: 100 },
    resourceRegeneration: { Blossoms: 0.3 },
  }
}
const cast = (skill: string): RotationStep => ({ type: "skill", skill })

describe("Jade combat", () => {
  it("pays input latency once for pursuit rather than for its internal route selection", () => {
    const data = input([cast("ForsakenFame"), cast("EmeraldBarrier"), cast("MoonShatterSpring"), cast("ForsakenFame")])
    data.rotation.ping = 40
    const casts = buildRotationTimeline(data).filter(row => row.kind === "rotation" && row.step.type === "skill")
    const pursuit = casts.find(row => row.step.skill === "MoonShatterSpring")!
    expect(pursuit.effectiveCastTime).toBeCloseTo(2.433, 9)
    expect(casts.at(-1)!.startTime - pursuit.startTime).toBeCloseTo(2.433 + 0.04, 9)
  })
  it.each([
    [2, 2],
    [3, 1],
  ])("admits Peak's preliminary hit only below 2.5m (%s)", (distance, hits) => {
    const data = input([cast("Position"), cast("PeaksSpringlessSilence")])
    data.skills = { ...data.skills, Position: { castTime: 0, action: [{ type: "move", distance, time: 0 }] } }
    const row = buildRotationTimeline(data).find(row => row.step.skill === "PeaksSpringlessSilence")!
    expect(
      row.actions.filter(
        (action, index) => action.type === "damage" && row.actionStates[index]?.combatOrder !== undefined,
      ),
    ).toHaveLength(hits)
  })
  it.each([
    ["PeaksSpringlessSilence", 1.1133333333333333],
    ["PeaksSpringlessSilenceCancel", 0.557581475],
  ])("uses %s to refresh Bone and enable the five-hit pursuit", (skill, duration) => {
    const rows = buildRotationTimeline(input([cast("ForsakenFame"), cast(skill as string), cast("MoonShatterSpring")]))
    const special = rows.find(row => row.step.skill === skill)!
    const pursuit = rows.find(row => row.step.skill === "MoonShatterSpring")!
    expect(pursuit.startTime - special.startTime).toBeCloseTo(duration as number, 9)
    expect(pursuit.buffs.get("Windrider")?.expiresAt).toBeCloseTo(special.startTime + 0.557581475 + 3, 9)
    expect(pursuit.debuffs.get("LingeringBone")?.expiresAt).toBeCloseTo(special.startTime + 0.557581475 + 5, 9)
    expect(pursuit.effectiveCastTime).toBeCloseTo(2.433, 9)
  })
  it("shares Peak cooldown across variants and does not grant Windrider on an unmarked target", () => {
    const rows = buildRotationTimeline(
      input([cast("PeaksSpringlessSilenceCancel"), cast("MoonShatterSpring"), cast("PeaksSpringlessSilence")]),
    )
    const pursuit = rows.find(row => row.step.skill === "MoonShatterSpring")!
    expect(pursuit.buffs.has("Windrider")).toBe(false)
    expect(pursuit.effectiveCastTime).toBeCloseTo(1.557, 9)
    expect(rows.find(row => row.step.skill === "PeaksSpringlessSilence")!.startTime).toBe(12)
  })
  it("keeps the selected five-hit pursuit when Windrider expires during its cast", () => {
    const rows = buildRotationTimeline(
      input([
        cast("EmeraldBarrier"),
        { type: "event", event: "Delay", duration: 3 },
        cast("ForsakenFame"),
        cast("MoonShatterSpring"),
        cast("ForsakenFame"),
      ]),
    )
    const pursuit = rows.find(row => row.step.skill === "MoonShatterSpring")!
    expect(pursuit.buffs.has("Windrider")).toBe(true)
    expect(pursuit.effectiveCastTime).toBeCloseTo(2.433, 9)
    expect(rows.at(-1)!.buffs.has("Windrider")).toBe(false)
    expect(rows.at(-1)!.buffs.get("StartlingSpring")?.stack).toBe(5)
  })
  it.each([
    ["EmeraldBarrierCancel", 3, 1.557],
    ["EmeraldBarrier", 5, 2.433],
  ])("selects the pursuit from Windrider after %s and buffs subsequent charged attacks", (barrier, hits, duration) => {
    const rows = buildRotationTimeline(
      input([
        cast("ForsakenFame"),
        cast(barrier as string),
        cast("MoonShatterSpring"),
        cast("ForsakenFame"),
        cast("MoonShatterSpring"),
      ]),
    )
    const pursuits = rows.filter(row => row.step.skill === "MoonShatterSpring")
    expect(
      pursuits[0].actions.filter(
        (action, index) => action.type === "damage" && pursuits[0].actionStates[index]?.combatOrder !== undefined,
      ),
    ).toHaveLength(hits as number)
    expect(pursuits[0].effectiveCastTime).toBeCloseTo(duration as number, 9)
    expect(pursuits[1].startTime - pursuits[0].startTime).toBeCloseTo(6, 9)
    const charged = rows.filter(row => row.step.skill === "ForsakenFame")[1]
    expect(charged.buffs.get("StartlingSpring")?.stack).toBe(hits)
    expect(charged.startTime).toBeCloseTo(pursuits[0].startTime + (duration as number), 9)
  })
  it.each([
    ["EmeraldBarrier", 1.02, true],
    ["EmeraldBarrierCancel", 0.167, false],
  ])("applies Jadebreak after the opening hit of %s", (skill, duration, windrider) => {
    const rows = buildRotationTimeline(input([cast(skill as string), cast("ForsakenFame")]))
    const barrier = rows.find(row => row.step.skill === skill)!
    const hit = barrier.actions.findIndex(action => action.type === "damage")
    expect(barrier.actionStates[hit].buffs.has("Jadebreak")).toBe(false)
    const next = rows.find(row => row.step.skill === "ForsakenFame")!
    expect(next.startTime).toBeCloseTo(duration as number, 9)
    expect(next.buffs.get("Jadebreak")!.expiresAt).toBeCloseTo(15.167, 9)
    expect(next.buffs.has("Windrider")).toBe(windrider)
  })
  it("shares sequential charges between full and cancelled Fan Q", () => {
    const rows = buildRotationTimeline(
      input([cast("EmeraldBarrierCancel"), cast("EmeraldBarrier"), cast("EmeraldBarrierCancel")]),
    ).filter(row => row.step.skill === "EmeraldBarrier" || row.step.skill === "EmeraldBarrierCancel")
    expect(rows.map(row => row.startTime)).toEqual([0, 0.167, 15])
  })
  it.each(["SpringSorrow", "VernalHeavy", "colorfulphoenix2"])(
    "holds %s until Flower depletes while allowing its projectiles to continue",
    skill => {
      const rows = buildRotationTimeline(input([cast("UnfadingFlowerCancel"), cast(skill), cast("ForsakenFame")], 100))
      const umbrella = rows.find(row => row.step.skill === skill)!
      const removal = rows.find(row =>
        row.actions.some(action => action.type === "consume" && action.value === "UnfadingFlowerMode"),
      )!
      expect(removal.startTime).toBeCloseTo(10.6, 8)
      expect(umbrella.startTime).toBeCloseTo(removal.startTime, 8)
      expect(umbrella.buffs.has("UnfadingFlowerMode")).toBe(false)
      expect(umbrella.resources.Blossoms).toBeCloseTo(0, 8)
      const projectiles = rows.filter(row => row.step.skill === "UnfadingFlowerProjectile")
      expect(projectiles.length).toBeGreaterThan(10)
      expect(projectiles.at(-1)!.startTime).toBeLessThan(removal.startTime)
      expect(rows.at(-1)!.buffs.has("UnfadingFlowerMode")).toBe(false)
    },
  )
  it("cancels Flower at buff application and keeps its projectiles through Deflect", () => {
    const normal = buildRotationTimeline(
      input([cast("UnfadingFlower"), cast("ForsakenFame"), { type: "event", event: "Delay", duration: 1 }], 100),
    )
    const cancelled = buildRotationTimeline(
      input(
        [
          cast("UnfadingFlowerCancel"),
          cast("Deflect"),
          cast("ForsakenFame"),
          { type: "event", event: "Delay", duration: 1.193 },
        ],
        100,
      ),
    )
    const deflect = cancelled.find(row => row.step.skill === "Deflect")!
    expect(deflect.buffs.has("UnfadingFlowerMode")).toBe(true)
    expect(deflect.startTime).toBeCloseTo(0.6, 9)
    expect(
      normal.find(row => row.step.skill === "ForsakenFame")!.startTime -
        cancelled.find(row => row.step.skill === "ForsakenFame")!.startTime,
    ).toBeCloseTo(0.193, 9)
    expect(cancelled.filter(row => row.step.skill === "UnfadingFlowerProjectile").map(row => row.startTime)).toEqual(
      normal.filter(row => row.step.skill === "UnfadingFlowerProjectile").map(row => row.startTime),
    )
  })
  it("migrates saved Phoenix selections without losing user timing", () => {
    const rotation = migrateRotation({
      name: "Saved Jade",
      steps: [{ type: "skill", skill: "colorfulphoenix3", duration: 0.6 }],
    })
    expect(rotation.steps[0]).toMatchObject({ skill: "ColorfulPhoenix", duration: 0.6 })
    expect(migrateRotation(rotation)).toEqual(rotation)
  })
  it("applies signed Blossom events within the resource cap and preserves them through transfer", () => {
    const data = input([
      { type: "event", event: "Blossoms", before: { action: 0 }, amount: 200 },
      cast("Observe"),
      { type: "event", event: "Blossoms", startTime: 0.2, amount: -150 },
      { type: "event", event: "Blossoms", startTime: 0.4, amount: 12.5 },
    ])
    data.eventDefinitions = events
    data.resourceRegeneration = {}
    data.skills = {
      Observe: { castTime: 1, action: [0.1, 0.3, 0.5].map(time => ({ type: "damage", phyCoef: 1, time })) },
    }
    const observer = buildRotationTimeline(data).find(row => row.step.skill === "Observe")!
    expect(Object.values(observer.actionStates).map(state => state.resources.Blossoms)).toEqual([100, 0, 12.5])
    const entries = [{ id: "blossom-events", martialArts: ["vernalUmbrella" as const], rotation: data.rotation }]
    expect(JSON.parse(serializeRotationEntries(entries))[0].rotation.steps).toEqual(data.rotation.steps)
    expect(
      mergeImportedRotationEntries([], JSON.parse(exportRotationEntries(entries))).entries[0].rotation.steps,
    ).toEqual(data.rotation.steps)
  })
  it.each([true, false])("refreshes only an existing Lingering Bone mark (marked: %s)", marked => {
    const data = input(
      [
        ...(marked ? [cast("ForsakenFame")] : []),
        cast("UnfadingFlower"),
        { type: "event", event: "Delay", duration: 12 },
        cast("Observe"),
      ],
      100,
    )
    data.skills = { ...data.skills, Observe: { castTime: 0, action: [] } }
    const rows = buildRotationTimeline(data)
    const projectiles = rows.filter(row => row.step.skill === "UnfadingFlowerProjectile")
    expect(projectiles.length).toBeGreaterThan(2)
    for (let index = 1; index < projectiles.length; index++) {
      const bone = projectiles[index].debuffs.get("LingeringBone")
      expect(bone?.expiresAt ?? -1).toBeCloseTo(marked ? projectiles[index - 1].startTime + 5 : -1, 9)
    }
    const grants = rows.filter(row => row.step.skill === "StarReacherGrant")
    expect(grants.length > 2).toBe(marked)
    expect((grants.at(-1)?.startTime ?? -1) > projectiles[0].startTime).toBe(marked)
    for (let index = 1; index < grants.length; index++)
      expect(grants[index].startTime - grants[index - 1].startTime).toBeGreaterThanOrEqual(1 - 1e-9)
    // The original charged-light grant has expired; projectile refreshes keep it alive.
    expect(rows.find(row => row.step.skill === "Observe")!.buffs.has("StarReacherBone")).toBe(marked)
    expect(rows.find(row => row.step.skill === "Observe")!.debuffs.has("LingeringBone")).toBe(false)
  })
  it.each(["18", "19"])(
    "maintains the Jade cycle and buffs for a full minute at breakthrough %s",
    async breakthrough => {
      const fixture = (await loadDpsSnapshotFixtures(breakthrough)).find(
        entry => entry.id === "silkbindJade/jade-three-rounds",
      )!
      const bundle = buildPresetRotationBundle(
        { pathId: fixture.pathId, ...fixture.fixture, rotation: fixture.rotation, skillOverrides: {}, previewId: null },
        fixture.fixture.build,
      )!
      const result = calculateRotationBaseline(bundle)
      const authoredSkills = fixture.rotation.steps.filter(step => step.type === "skill")
      for (const [index] of Array.from(authoredSkills.entries()).filter(([, step]) =>
        ["EmeraldBarrierCancel", "PeaksSpringlessSilenceCancel"].includes(step.skill ?? ""),
      ))
        expect(authoredSkills[index + 1]?.skill).toBe("MoonShatterSpring")
      for (const [index] of Array.from(authoredSkills.entries()).filter(([, step]) =>
        ["UnfadingFlowerCancel", "LeapingToad"].includes(step.skill ?? ""),
      ))
        expect(authoredSkills[index + 1]?.skill).toBe("Deflect")
      for (const [index, step] of authoredSkills.entries()) {
        if (!["DragonsBreathSmolder1", "DrunkenPoet5HitsCancel"].includes(step.skill ?? "")) continue
        expect(["Deflect", "EmeraldBarrier", "EmeraldBarrierCancel", "MoonShatterSpring"]).toContain(
          authoredSkills[index + 1]?.skill,
        )
      }
      const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
      for (const [index, row] of Array.from(casts.entries()).filter(([, row]) =>
        [
          "PeaksSpringlessSilenceCancel",
          "EmeraldBarrierCancel",
          "DragonsBreathSmolder1",
          "DrunkenPoet5HitsCancel",
        ].includes(row.step.skill ?? ""),
      ))
        expect(casts[index + 1].startTime).toBeLessThanOrEqual(row.startTime + row.effectiveCastTime + 0.04 + 1e-8)
      expect(casts[0].step.skill).toBe("FluteOfTheTidesCancel")
      expect(casts[1].step.skill).toBe("EmeraldBarrier")
      const openingQ = casts.find(row => row.step.skill === "SpringSorrow")!
      expect(openingQ.resources.Blossoms).toBe(0)
      expect(openingQ.actionStates[0].resources.Blossoms).toBe(0)
      const secondQ = casts.filter(row => row.step.skill === "SpringSorrow")[1]
      expect(secondQ.resources.Blossoms).toBeCloseTo(
        20 + 0.3 * (secondQ.startTime - openingQ.startTime - Number(openingQ.actions[0].time)),
        8,
      )
      const flowers = casts.filter(row => row.step.skill === "UnfadingFlowerCancel")
      expect(flowers.length).toBeGreaterThanOrEqual(7)
      const flutes = casts.filter(row => row.step.skill === "FluteOfTheTidesCancel")
      expect(flutes).toHaveLength(3)
      for (const flute of flutes.slice(1)) expect(flute.buffs.has("UnfadingFlowerMode")).toBe(true)
      const fanQs = casts.filter(row => row.step.skill === "EmeraldBarrier")
      for (let index = 1; index < fanQs.length; index++) {
        expect(fanQs[index].startTime).toBeLessThan(fanQs[index - 1].startTime + 15)
        expect(fanQs[index].buffs.has("Jadebreak")).toBe(true)
      }
      expect(result.duration).toBe(60)
      const battleEnd = result.timeline.find(row => row.step.type === "event" && row.step.event === "BattleEnd")!
      expect(battleEnd.startTime - openingQ.startTime - Number(openingQ.actions[0].time)).toBeCloseTo(60, 9)
      const hits = result.timeline.flatMap(row =>
        row.actions.flatMap((action, index) =>
          action.type === "damage" && result.actionBreakdowns[`${row.id}:${index}`]
            ? [row.startTime + Number(action.time ?? 0)]
            : [],
        ),
      )
      expect(Math.max(...hits)).toBeLessThan(battleEnd.startTime)
      expect(Math.max(...hits)).toBeGreaterThan(battleEnd.startTime - 2)
      for (const flower of flowers) {
        expect(flower.resources.Blossoms).toBe(100)
        expect(flower.buffs.has("Jadebreak")).toBe(true)
        expect(flower.debuffs.has("JadeCombo")).toBe(true)
      }
      const phoenixCasts = casts.filter(row => row.step.skill === "colorfulphoenix2")
      expect(phoenixCasts.every(row => row.effectiveCastTime < 0.7442)).toBe(true)
      for (const phoenix of phoenixCasts) {
        const next = casts[casts.indexOf(phoenix) + 1]
        expect(next.step.skill).toBe("UnfadingFlowerCancel")
        expect(next.startTime).toBeCloseTo(phoenix.startTime + phoenix.effectiveCastTime + 0.04, 8)
      }
      for (const row of casts.filter(row => row.startTime > flowers[0].startTime && row.skill?.weapon === "Fan"))
        expect(row.buffs.has("UnfadingFlowerMode")).toBe(true)
      for (const row of result.timeline.filter(row => row.step.type === "event" && row.step.event === "Delay"))
        expect(row.buffs.has("UnfadingFlowerMode")).toBe(true)
      for (const row of casts.filter(row => row.skill?.weapon === "Umbrella"))
        expect(row.buffs.has("UnfadingFlowerMode")).toBe(false)
      expect(flowers[2].actionStates[0].debuffs.has("Exhausted")).toBe(true)
      const firstBone = casts.find(row => row.step.skill === "ForsakenFame")!
      for (const row of casts.filter(row => row.startTime > firstBone.startTime))
        expect(row.debuffs.has("LingeringBone")).toBe(true)
      for (const row of result.timeline) {
        for (const [index, action] of row.actions.entries()) {
          if (action.type !== "damage" || !result.actionBreakdowns[`${row.id}:${index}`]) continue
          expect(row.actionStates[index].buffs.has("Jadebreak")).toBe(true)
          if (row.startTime + Number(action.time ?? 0) <= firstBone.startTime + 1.19 + 1e-9) continue
          expect(row.actionStates[index].debuffs.has("LingeringBone")).toBe(true)
          expect(
            row.actionStates[index].buffs.has("StarReacherBone") ||
              row.actionStates[index].buffs.has("StarReacherBoneEnhanced"),
          ).toBe(true)
        }
      }
      expect(result.metrics.totalDamage).toBeGreaterThan(0)
    },
  )
  it.each([
    [1, 0.3251, 16],
    [2, 0.53, 32],
    [3, 0.7442, 40],
  ])("plays the selected %s Phoenix hits regardless of the Blossom cap", (hits, duration, gain) => {
    for (const blossoms of [0, 96, 100]) {
      const data = input(
        [cast(hits === 3 ? "ColorfulPhoenix" : "colorfulphoenix" + hits), cast("ForsakenFame")],
        blossoms,
      )
      data.resourceRegeneration = {}
      const rows = buildRotationTimeline(data)
      expect(rows[0].effectiveCastTime).toBeCloseTo(duration, 9)
      expect(rows[0].actions.filter(action => action.type === "damage")).toHaveLength(hits)
      expect(rows[1].resources.Blossoms).toBe(Math.min(100, blossoms + gain))
    }
  })

  it("adds target-check grants independently of damage hits without adding damage triggers", () => {
    const data = input([cast("ColorfulPhoenix"), cast("ForsakenFame")])
    data.resourceRegeneration = {}
    const rows = buildRotationTimeline(data)
    expect(rows[0].actions.filter(action => action.type === "damage")).toHaveLength(3)
    expect(rows[0].actions.filter(action => action.type === "addResource")).toHaveLength(10)
    expect(rows.find(row => row.step.skill === "ForsakenFame")!.resources.Blossoms).toBe(40)
  })

  it("uses accepted Q projectile timing and grants its extra Blossoms only against existing Combo", () => {
    const rows = buildRotationTimeline(input([cast("SpringSorrow"), cast("SpringSorrow"), cast("ForsakenFame")]))
    expect(rows[0].effectiveCastTime).toBeCloseTo(1.1217948717948718, 9)
    expect(rows[0].actions[0].time).toBeCloseTo(0.7779487179487179, 12)
    expect(rows[1].resources.Blossoms).toBeCloseTo(20 + 0.3 * rows[1].startTime, 8)
    expect(rows[2].resources.Blossoms).toBeCloseTo(65 + 0.3 * rows[2].startTime, 8)
  })

  it.each([
    [undefined, 2],
    ["BlossomBarrageT0", 3],
  ])("uses %s charge capacity for both cast readiness and recovery", (condition, capacity) => {
    const data = input(Array.from({ length: capacity + 1 }, () => cast("SpringSorrow")))
    data.innerWayConditions = condition ? [condition] : []
    data.innerWayRules = []
    data.skills = {
      ...data.skills,
      SpringSorrowNormal: { ...data.skills.SpringSorrowNormal, action: [] },
      SpringSorrowBarrage: { ...data.skills.SpringSorrowBarrage, action: [] },
    }
    const casts = buildRotationTimeline(data).filter(row => row.step.skill === "SpringSorrow")
    expect(casts[capacity - 1].startTime).toBeLessThan(15)
    expect(casts[capacity].startTime).toBe(15)
  })

  it("refunds three Blossoms per projectile on an exhausted target", () => {
    const data = input([cast("Mark"), cast("UnfadingFlower"), { type: "event", event: "Delay", duration: 10 }], 100)
    data.skills = {
      ...data.skills,
      Mark: {
        castTime: 0,
        action: ["Exhausted", "LingeringBone"].map(value => ({
          type: "apply",
          target: "target",
          value,
          duration: 20,
          time: 0,
        })),
      },
    }
    data.setupEffects = vernal.talent[13].flatMap<EditableObject>(talent => talent.effect)
    const projectiles = buildRotationTimeline(data).filter(row => row.step.skill === "UnfadingFlowerProjectile")
    expect(projectiles[1].resources.Blossoms).toBeCloseTo(projectiles[0].resources.Blossoms - 7, 9)
    expect(projectiles.at(-1)!.startTime).toBeGreaterThan(7)
  })

  it("uses a spare Fan Q charge to refresh Jadebreak before expiry", () => {
    const data = input([
      cast("EmeraldBarrier"),
      { type: "event", event: "Delay", duration: 10 },
      cast("EmeraldBarrier"),
      cast("EmeraldBarrier"),
    ])
    const casts = buildRotationTimeline(data).filter(row => row.step.skill === "EmeraldBarrier")
    expect(casts[1].startTime).toBeCloseTo(11.02, 9)
    expect(casts[1].buffs.has("Jadebreak")).toBe(true)
    expect(casts[2].startTime).toBeCloseTo(15, 9)
    expect(casts[2].buffs.has("Jadebreak")).toBe(true)
  })

  it("ends Unfading Flower across filler casts and refunds Blossoms after 0.2 seconds", () => {
    const rows = buildRotationTimeline(
      input([cast("UnfadingFlower"), ...Array.from({ length: 7 }, () => cast("ForsakenFame"))], 100),
    )
    const removal = rows.find(row =>
      row.actions.some(action => action.type === "consume" && action.value === "UnfadingFlowerMode"),
    )!
    expect(removal).toBeDefined()
    expect(removal.startTime).toBeGreaterThan(5)
    expect(removal.startTime).toBeLessThan(7)
    const projectiles = rows.filter(row => row.step.skill === "UnfadingFlowerProjectile")
    expect(projectiles[0].startTime).toBeCloseTo(1.15, 9)
    expect(projectiles.at(-1)!.startTime).toBeLessThan(removal.startTime)
    expect(rows.at(-1)!.resources.Blossoms).toBeGreaterThan(15)
  })

  it("grants Thunder stacks at cast completion and spends once per damage-bonus window", () => {
    const rows = buildRotationTimeline(input([cast("EmeraldBarrier"), cast("colorfulphoenix2"), cast("ForsakenFame")]))
    expect(rows[0].actionStates[1].buffs.has("SpringThunder")).toBe(false)
    expect(rows[1].resources).toBeDefined()
    expect(rows[1].buffs.get("SpringThunder")?.stack).toBe(5)
    expect(rows[2].buffs.get("SpringThunder")?.stack).toBe(4)
  })
})
