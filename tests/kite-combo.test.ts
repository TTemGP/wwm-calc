import buffs from "@gamedata/buff/bamboocut-kite.json"
import skills from "@gamedata/skill/heavenwill-gauntlets.json"
import { describe, expect, it } from "vitest"

import { buildRotationTimeline } from "@/calculations/rotationTimeline"

import { castStep } from "./helpers/rotationSteps"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const run = (ids: string[], tier1 = false) =>
  buildRotationTimeline({
    rotation: { name: "Kite combo", steps: ids.map(skill => castStep(skill)) },
    skills: { ...asSkillRecords(skills), Observe: { castTime: 0 } },
    effectDefinitions: asEffectDefinitions(buffs),
    dots: {},
    eventDefinitions: {},
    innerWayConditions: tier1 ? ["SoaringHighT0", "SoaringHighT1"] : ["SoaringHighT0"],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["heavenwill"],
  })

const observe = (ids: string[], tier1 = false) => run([...ids, "Observe"], tier1).at(-1)!

describe("Kite combo stage tracking", () => {
  it("replaces light stages throughout the chain and loops from A6 to A2", () => {
    const chain = ["1st", "2nd", "3rd", "4th", "5th", "6th"].map(n => `RighteousReign${n}Hit`)
    for (let n = 1; n <= chain.length; n++) {
      const row = observe(chain.slice(0, n))
      expect(row.buffs.get("HeavenwillLightCombo")?.stack).toBe(n === 6 ? 2 : n + 1)
    }
    expect(observe(["RighteousReign6thHitCancel"]).buffs.get("HeavenwillLightCombo")?.stack).toBe(2)
  })

  it.each([
    ["VirtuousEnthroned1stHit", 3, 2],
    ["VirtuousEnthroned2ndHit", 3, 3],
    ["VirtuousEnthroned3rdHit", 5, 4],
    ["VirtuousEnthroned4thHit", 5, undefined],
  ])("%s updates independent light and heavy successors", (skill, light, heavy) => {
    const row = observe(["VirtuousEnthroned1stHit", skill])
    expect(row.buffs.get("HeavenwillLightCombo")?.stack).toBe(light)
    expect(row.buffs.get("HeavenwillHeavyCombo")?.stack).toBe(heavy)
  })

  it.each(["WickedDefiance", "CelestialMandate"])("gates %s's A5 shortcut on Soaring High T1", skill => {
    const prefix = ["RighteousReign2ndHit", skill]
    expect(observe(prefix).buffs.get("HeavenwillLightCombo")?.stack).toBe(3)
    expect(observe(prefix, true).buffs.get("HeavenwillLightCombo")?.stack).toBe(5)
  })

  it.each([
    "AllUnderJustice",
    "WickedDefiance",
    "CelestialMandate",
    "VirtuousEnthroned3rdHit",
    "VirtuousEnthroned4thHit",
  ])("%s's A5 shortcut does not grant the fast A4 continuation", skill => {
    const rows = run([skill, "RighteousReign5thHit", "Observe"], true)
    const a5 = rows.find(row => row.step.skill === "RighteousReign5thHit")!
    expect(a5.buffs.get("HeavenwillLightCombo")?.stack).toBe(5)
    expect(a5.buffs.has("HeavenwillGauntletsA4")).toBe(false)
    expect(a5.effectiveCastTime).toBeCloseTo(0.512)
    expect(rows.at(-1)!.buffs.get("HeavenwillLightCombo")?.stack).toBe(6)
  })

  it("enabling the shortcut changes stage state without changing attack events or timing", () => {
    const ids = ["VirtuousEnthroned4thHit", "WickedDefiance", "CelestialMandate", "Observe"]
    const base = run(ids)
    const enabled = run(ids, true)
    const events = (rows: typeof base) =>
      rows.map(row => ({
        skill: row.step.skill,
        start: row.startTime,
        duration: row.effectiveCastTime,
        damage: row.actions.filter(action => action.type === "damage"),
      }))
    expect(events(enabled)).toEqual(events(base))
  })
})
