import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { compareDpsSnapshots, dpsSnapshotUlpBudget } from "./helpers/dps-snapshot-guard.mjs"

// Ported from script/probe/check-dps-snapshot-guard.mjs.
describe("dps-snapshot-guard", () => {
  // Steps a positive double by whole units in the last place, so the cases below
  // state distances the engine can actually produce.
  const stepUlp = (value: number, steps: number) => {
    const view = new DataView(new ArrayBuffer(8))
    view.setFloat64(0, value)
    view.setBigUint64(0, view.getBigUint64(0) + BigInt(steps))
    return view.getFloat64(0)
  }
  const sample = (overrides = {}) => ({
    fixture: { build: "example", rotation: "one-minute" },
    dps: 100,
    totalDamage: 6000,
    duration: 60,
    ...overrides,
  })
  const baseline = { example: sample() }

  it("accepts floating-point noise and rejects real changes in either direction", () => {
    for (const field of ["dps", "totalDamage", "duration"] as const) {
      const accepted = sample()
      for (const steps of [0, 1, dpsSnapshotUlpBudget]) {
        assert.deepEqual(
          compareDpsSnapshots({ example: accepted }, { example: sample({ [field]: stepUlp(accepted[field], steps) }) }),
          [],
          `${field} must accept a ${steps} ULP shift`,
        )
      }
      for (const steps of [dpsSnapshotUlpBudget + 1, 1e6]) {
        for (const sign of [1, -1]) {
          assert(
            compareDpsSnapshots(
              { example: accepted },
              { example: sample({ [field]: stepUlp(accepted[field], sign * steps) }) },
            ).length > 0,
            `Must block a ${field} shift of ${sign * steps} ULPs`,
          )
        }
      }
      assert(
        compareDpsSnapshots({ example: accepted }, { example: sample({ [field]: accepted[field] * 1.01 }) }).length > 0,
        `A 1% ${field} change must stay blocked`,
      )
    }
  })

  it("scales the budget with magnitude instead of using a fixed absolute band", () => {
    for (const dps of [0.5, 100, 58_334, 6_000_000]) {
      assert.deepEqual(
        compareDpsSnapshots({ large: sample({ dps }) }, { large: sample({ dps: stepUlp(dps, dpsSnapshotUlpBudget) }) }),
        [],
      )
      assert(compareDpsSnapshots({ large: sample({ dps }) }, { large: sample({ dps: stepUlp(dps, 1e6) }) }).length > 0)
    }
  })

  it("keeps coverage, fixture, validity, and per-path checks independent", () => {
    assert(
      compareDpsSnapshots(
        { first: sample(), second: sample() },
        { first: sample({ dps: 99 }), second: sample({ dps: 101 }) },
      ).length === 2,
      "Opposing path changes must fail individually even when their combined DPS is unchanged",
    )
    assert(compareDpsSnapshots({}, baseline).length > 0, "New implemented paths need snapshots")
    assert(compareDpsSnapshots(baseline, {}).length > 0, "Coverage cannot silently disappear")
    assert(compareDpsSnapshots(baseline, { example: sample({ fixture: { build: "changed" } }) }).length > 0)
    assert(
      compareDpsSnapshots({ example: sample({ dps: 0 }) }, baseline).length > 0,
      "Invalid baselines cannot bypass the gate",
    )
    assert.deepEqual(baseline.example, sample(), "Comparisons never update the accepted baseline")
  })
})
