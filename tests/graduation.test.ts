import { assert, describe, it } from "vitest"

import { typedPathDefinitions } from "@/application/gameData/paths"
import {
  buildGraduationBundleSet,
  selectHighestGraduationResult,
  type GraduationPresetEnvironment,
} from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

describe("graduation", () => {
  it("selects the highest-DPS Strength graduate for each playstyle rotation", async () => {
    const fixtures = await loadDpsSnapshotFixtures()
    const scenarios = [
      { rotationId: "stonesplitStrength/mixed-dummy-1-min", winningBuildId: "mixed-full-min" },
      { rotationId: "stonesplitStrength/pure-dummy-1-min", winningBuildId: "pure-full-min" },
    ] as const

    for (const scenario of scenarios) {
      const fixture = fixtures.find(entry => entry.id === scenario.rotationId)
      assert(fixture, `${scenario.rotationId} fixture must exist.`)
      const path = typedPathDefinitions[fixture.pathId]
      const environment: GraduationPresetEnvironment = {
        pathId: fixture.pathId,
        martialArts: fixture.fixture.martialArts,
        rotation: { ...fixture.rotation, ping: fixture.fixture.ping },
        breakthrough: fixture.fixture.breakthrough,
        globalDebuffs: fixture.fixture.globalDebuffs,
        food: fixture.fixture.food,
        script: fixture.fixture.script,
        divinecraft: fixture.fixture.divinecraft,
        graduatedBuildIds: path.graduated,
        skillOverrides: {},
        previewId: null,
      }
      const prepared = buildGraduationBundleSet(environment)
      assert(prepared, `${scenario.rotationId} must resolve its graduate builds.`)
      const candidateIds = prepared.candidates.map(candidate => candidate.buildId)
      assert.lengthOf(candidateIds, 2)
      assert.include(candidateIds, "mixed-full-min")
      assert.include(candidateIds, "pure-full-min")

      // A graduation run keeps only the throughput it is compared by, so the selection is
      // made over the same two numbers the worker reports rather than over full baselines.
      const throughputs = prepared.candidates.map(candidate => {
        const calculated = calculateRotationBaseline(candidate.bundle)
        return { dps: calculated.metrics.dps, hps: calculated.metrics.hps }
      })
      const highest = selectHighestGraduationResult(throughputs)
      assert(highest, `${scenario.rotationId} must select a calculated preset.`)
      const highestIndex = throughputs.indexOf(highest)
      assert.equal(highest.dps, Math.max(...throughputs.map(result => result.dps)))
      assert.equal(candidateIds[highestIndex], scenario.winningBuildId)
      assert.isAbove(highest.dps, 0)
    }
  })
})
