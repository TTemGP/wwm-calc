import { describe, expect, it } from "vitest"

import type { RotationSkillBreakdown } from "../src/calculations/rotationMetrics"
import { groupSkillBreakdown } from "../src/calculations/skillBreakdownCategories"

const damageRow = (id: string, hits: number, damage: number, criticalRate: number): RotationSkillBreakdown => ({
  id,
  name: id,
  casts: 1,
  triggers: 0.5,
  hits,
  damage,
  abrasionRate: 0,
  normalRate: 100 - criticalRate,
  criticalRate,
  affinityRate: 0,
  percentage: damage / 10,
})

describe("skill breakdown categories", () => {
  it("sums contributions, weights rates by hits, and retains individual details without mutating them", () => {
    const rows = [damageRow("first", 1, 100, 20), damageRow("second", 3, 300, 60), damageRow("other", 2, 250, 40)]
    const before = structuredClone(rows)
    const grouped = groupSkillBreakdown(rows, {
      first: { skillBreakdownCategory: "Combo" },
      second: { skillBreakdownCategory: "Combo" },
    })
    expect(grouped).toHaveLength(2)
    expect(grouped[0]).toMatchObject({
      name: "Combo",
      casts: 2,
      triggers: 1,
      hits: 4,
      damage: 400,
      percentage: 40,
      normalRate: 50,
      criticalRate: 50,
      children: rows.slice(0, 2),
    })
    expect(grouped[1]).toEqual(rows[2])
    expect(grouped.reduce((sum, row) => sum + row.damage, 0)).toBe(650)
    expect(rows).toEqual(before)
  })

  it("weights healing by recipient heal counts and handles categories with no hits", () => {
    const grouped = groupSkillBreakdown(
      [
        {
          id: "one",
          name: "One",
          casts: 1,
          triggers: 0,
          heals: 1,
          healing: 100,
          normalRate: 80,
          criticalRate: 20,
          percentage: 25,
        },
        {
          id: "many",
          name: "Many",
          casts: 1,
          triggers: 2,
          heals: 3,
          healing: 300,
          normalRate: 40,
          criticalRate: 60,
          percentage: 75,
        },
      ],
      { one: { skillBreakdownCategory: "Heal" }, many: { skillBreakdownCategory: "Heal" } },
    )
    expect(grouped[0]).toMatchObject({ heals: 4, healing: 400, percentage: 100, criticalRate: 50, normalRate: 50 })
    expect(
      groupSkillBreakdown([damageRow("empty", 0, 0, 0)], { empty: { skillBreakdownCategory: "Empty" } })[0],
    ).toMatchObject({ hits: 0, criticalRate: 0, normalRate: 0 })
  })
})
