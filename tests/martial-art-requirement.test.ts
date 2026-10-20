import { describe, expect, it } from "vitest"

import { effectState } from "../src/calculations/trackedEffectState"

// Ported from script/probe/check-martial-art-requirement.mjs.
describe("martial-art-requirement", () => {
  it("Canonical martial-art requirement tag checks passed", async () => {
    const { requirementsPass } = await import("../src/calculations/rotationTimeline.ts")
    const requirement = [{ target: "martialArt", value: "SnowpartingBlade" }]
    expect(
      requirementsPass(requirement, effectState([]), effectState([]), ["SnowpartingBlade", "MartialArts"], new Set(), [
        "snowparting",
      ]),
      "A canonical martial-art tag must match its skill.",
    ).toBeTruthy()
    expect(
      !requirementsPass(requirement, effectState([]), effectState([]), ["Mystic"], new Set(), ["snowparting"]),
      "Equipping the martial art must not make its requirement pass for a Mystic skill.",
    ).toBeTruthy()
    expect(
      !requirementsPass(
        [{ target: "martialArt", value: "snowparting" }],
        effectState([]),
        effectState([]),
        ["SnowpartingBlade"],
        new Set(),
        ["snowparting"],
      ),
      "Legacy weapon IDs must not be accepted as martial-art tags.",
    ).toBeTruthy()
    expect(
      requirementsPass(
        [{ target: "equippedMartialArt", value: "heavenwill" }],
        effectState([]),
        effectState([]),
        ["SkygraspRopeDart"],
        new Set(),
        ["skygrasp", "heavenwill"],
      ),
      "An equipped-martial-art requirement must match either equipped slot.",
    ).toBeTruthy()
    expect(
      !requirementsPass(
        [{ target: "equippedMartialArt", value: "heavenwill" }],
        effectState([]),
        effectState([]),
        ["SkygraspRopeDart"],
        new Set(),
        ["skygrasp", "thundercry"],
      ),
      "An equipped-martial-art requirement must fail when the art is not equipped.",
    ).toBeTruthy()
  })
})
