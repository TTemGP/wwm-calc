import { assert, describe, expect, it } from "vitest"

import { breakthroughProfile, divinecraftEffectFor } from "@/application/gameData/setup"
import {
  buildRotationCalculationBundle,
  measurementSubject,
  type MeasurementContext,
} from "@/calculations/rotationCalculationBundle"
import { buildRotationComparisonBundle } from "@/calculations/rotationComparisonBundle"
import type { EditableObject, RotationRecord } from "@/calculations/rotationTimeline"
import type { BuildEntry } from "@/gear"

import { dpsSnapshotEnvironment, loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

/**
 * A rotation's own inputs have to reach the bundle the worker calculates, and they used to
 * reach it from inside the rotation editor rather than from the assembly the whole application
 * shares. That is a duplication that fails silently: the editor resolved the flag and the
 * Endurance wiring on the way past, and moving that code elsewhere would have dropped both
 * without a type error, a failing test, or a changed DPS baseline, because the DPS guard
 * measures preset rotations through `graduation.ts` rather than through this assembly.
 *
 * So these are behavioural: they read the effects a bundle actually carries, through
 * `measurementSubject`, which is the production projection from a build to a subject. The
 * fixture environment selects the `Fire` Divinecraft, whose authored effect has damage-event
 * rules, so "the flag reached the bundle" is observable as that effect being present whole or
 * reduced rather than as a boolean somewhere.
 */
async function fixture() {
  const fixtures = await loadDpsSnapshotFixtures()
  const entry = fixtures.find(candidate => candidate.id === "stonesplitStrength/mixed-dummy-1-min")
  assert(entry, "The strength fixture must exist.")
  const settings = {
    weapons: entry.fixture.martialArts,
    breakthrough: dpsSnapshotEnvironment.breakthrough,
    ping: dpsSnapshotEnvironment.ping,
  }
  const context: MeasurementContext = {
    environment: {
      pathId: entry.pathId,
      settings,
      setupSelections: {
        food: dpsSnapshotEnvironment.food,
        script: dpsSnapshotEnvironment.script,
        divinecraft: dpsSnapshotEnvironment.divinecraft,
      },
      skillOverrides: {},
      previewId: null,
      // The snapshot environment predates the draught row, so the state is spelled out here
      // rather than borrowed. This test reads the bundle, and a missing key is one of the
      // ways to have it read the wrong thing.
      globalDebuffs: { ...dpsSnapshotEnvironment.globalDebuffs, draught: "none" },
      enemy: breakthroughProfile(settings),
    },
    statOverrides: {},
    attunementOverrides: {},
  }
  const preset = entry.fixture.build
  const build: BuildEntry = { id: `build-${preset}`, name: preset, isDefault: true, presetId: preset }
  // The stored rotation carries no flag, which is the legacy shape and must keep damaging.
  const subjectFor = (divinecraftDamage?: boolean) =>
    measurementSubject({
      build,
      gearItems: [],
      context,
      rotation: (divinecraftDamage === undefined
        ? entry.rotation
        : ({ ...entry.rotation, divinecraftDamage } as RotationRecord)) satisfies RotationRecord,
    })
  return { subjectFor, divinecraft: dpsSnapshotEnvironment.divinecraft }
}

function carries(effects: EditableObject[] | undefined, effect: unknown) {
  return (effects ?? []).some(candidate => JSON.stringify(candidate) === JSON.stringify(effect))
}

describe("what a rotation carries into the shared bundle", () => {
  it("applies the Divinecraft damage flag to the bundle it builds", async () => {
    const { subjectFor, divinecraft } = await fixture()
    const whole = divinecraftEffectFor(divinecraft, true)
    const reduced = divinecraftEffectFor(divinecraft, false)

    const baseline = (divinecraftDamage?: boolean) =>
      buildRotationCalculationBundle(subjectFor(divinecraftDamage)).timeline.setupEffects

    expect(carries(baseline(true), whole)).toBeTruthy()
    expect(carries(baseline(false), whole)).toBeFalsy()
    expect(carries(baseline(false), reduced)).toBeTruthy()
    // A rotation that predates the flag must still deal Divinecraft damage.
    expect(carries(baseline(undefined), whole)).toBeTruthy()
  })

  it("gives every setup comparison the flag, so a delta isolates the option that varies", async () => {
    const { subjectFor, divinecraft } = await fixture()
    const whole = divinecraftEffectFor(divinecraft, true)
    // The food group varies the food, not the Divinecraft, so it is the group where a flag
    // that leaked into the variants would show up as a delta nobody asked for.
    const foodVariants = (divinecraftDamage?: boolean) =>
      buildRotationComparisonBundle(subjectFor(divinecraftDamage), true).setupComparisons.food ?? []

    const damaging = foodVariants(true)
    expect(damaging.length).toBeGreaterThan(0)
    expect(damaging.every(variant => carries(variant.setupEffects, whole))).toBeTruthy()

    const reduced = foodVariants(false)
    expect(reduced.length).toBeGreaterThan(0)
    expect(reduced.every(variant => !carries(variant.setupEffects, whole))).toBeTruthy()
  })

  it("caps and regenerates Endurance the way the system's own rates describe", async () => {
    const { subjectFor } = await fixture()
    const { timeline } = buildRotationCalculationBundle(subjectFor(true))

    // Endurance has to be in the timeline at all, or the system regeneration rates keyed to it
    // are read against a resource the rotation does not carry.
    expect(timeline.resourceMaximums?.Endurance).toBeGreaterThan(0)
    expect(Object.keys(timeline.resourceRegeneration ?? {})).toContain("Endurance")
    expect(Object.keys(timeline.resourceSpendRegenDelay ?? {})).toContain("Endurance")
  })
})
