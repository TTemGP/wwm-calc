import { assert, describe, it, vi } from "vitest"

import { breakthroughProfile } from "@/application/gameData/setup"
import { buildMeasurement, type MeasurementContext } from "@/calculations/rotationCalculationBundle"
import { buildPresetInventory, defaultBuildPresets, type BuildEntry } from "@/gear"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"
import { dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"

/**
 * A build that is not the active one is measured from the same assembly the rotation editor
 * uses, so these pin the properties that make its number mean anything: that the gear belongs
 * to the build being measured, that the same build always measures to the same key so the
 * cache can answer it, and that unsaved setup edits are not borrowed from another build.
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
      globalDebuffs: dpsSnapshotEnvironment.globalDebuffs,
      enemy: breakthroughProfile(settings),
    },
    statOverrides: {},
    attunementOverrides: {},
  }
  return { rotation: entry.rotation, context, presets: defaultBuildPresets }
}

function presetEntry(id: string): BuildEntry {
  const preset = defaultBuildPresets.find(candidate => candidate.id === id)
  assert(preset, `The ${id} preset must exist.`)
  return { id: `build-${id}`, name: id, isDefault: true, presetId: id }
}

describe("measuring a build that is not the active one", () => {
  it("measures the gear of the build it was given, not the active build's", async () => {
    const { rotation, context, presets } = await fixture()
    const first = presetEntry(presets[0].id)
    const second = presetEntry(presets[1].id)
    assert.notEqual(first.presetId, second.presetId, "The comparison needs two different builds.")

    const a = buildMeasurement({ build: first, gearItems: [], context, rotation })
    const b = buildMeasurement({ build: second, gearItems: [], context, rotation })

    assert.notEqual(
      a.cacheKey,
      b.cacheKey,
      "Two builds measured to the same key, so one would be answered with the other's numbers.",
    )
    assert.notDeepEqual(
      a.bundle.stats,
      b.bundle.stats,
      "Two builds produced the same stats, so the gear is not reaching the calculation.",
    )
  })

  it("measures the same build to the same key every time, so a revisit is answered from the cache", async () => {
    const { rotation, context, presets } = await fixture()
    const build = presetEntry(presets[0].id)
    const first = buildMeasurement({ build, gearItems: [], context, rotation })
    const second = buildMeasurement({ build: presetEntry(presets[0].id), gearItems: [], context, rotation })
    assert.equal(second.cacheKey, first.cacheKey, "The same build measured to two different keys.")
  })

  it("applies unsaved setup edits to the build they were made on and to no other", async () => {
    const { rotation, context, presets } = await fixture()
    const build = presetEntry(presets[0].id)
    const saved = buildMeasurement({ build, gearItems: [], context, rotation })

    const edited: MeasurementContext = {
      ...context,
      buildSetupOverrides: { buildId: build.id, overrides: { arsenal: "Stonesplit" } },
    }
    const withEdits = buildMeasurement({ build, gearItems: [], context: edited, rotation })
    assert.notEqual(
      withEdits.cacheKey,
      saved.cacheKey,
      "An unsaved setup edit did not reach the build it was made on, so the sheet and its DPS disagree.",
    )

    // The same edit, carried while measuring some other build, must leave that build alone: the
    // edits belong to whichever build's sheet is on screen, not to every build.
    const other = presetEntry(presets[1].id)
    const asSaved = buildMeasurement({ build: other, gearItems: [], context, rotation })
    const borrowed = buildMeasurement({ build: other, gearItems: [], context: edited, rotation })
    assert.equal(
      borrowed.cacheKey,
      asSaved.cacheKey,
      "Another build's unsaved setup edits leaked into a build that was only being compared.",
    )
  })

  it("resolves a build that no longer exists to an empty sheet rather than the active build's", async () => {
    const { rotation, context, presets } = await fixture()
    const missing = buildMeasurement({ build: undefined, gearItems: [], context, rotation })
    const aBuild = buildMeasurement({ build: presetEntry(presets[0].id), gearItems: [], context, rotation })
    assert.notEqual(missing.cacheKey, aBuild.cacheKey, "A missing build was measured as a real one.")
  })

  it("cannot answer a swapped slot from the reading of the gear it replaced", async () => {
    const { rotation, context, presets } = await fixture()
    // A preset's own gear, so the loadout is a real one to swap rather than an empty sheet.
    const base = presetEntry(presets[0].id)
    const equipped = buildPresetInventory(defaultBuildPresets[0])
    const helmet = equipped.equipped.helmet
    assert(helmet, "The preset must equip a helmet for this slot to be swappable.")
    const item = equipped.items.find(candidate => candidate.id === helmet)
    assert(item, "The preset's helmet must be in its inventory.")

    const withSlot = (equippedId: string | undefined) =>
      buildMeasurement({
        build: { ...base, isDefault: false, equipped: { ...equipped.equipped, helmet: equippedId } },
        gearItems: equipped.items,
        context,
        rotation,
      })

    const worn = withSlot(helmet)
    const empty = withSlot(undefined)
    const swapped = withSlot("some-other-helmet")

    assert.notEqual(empty.cacheKey, worn.cacheKey, "Emptying a slot did not change what the build measures to.")
    assert.notEqual(
      swapped.cacheKey,
      worn.cacheKey,
      "A swapped slot read as the gear it replaced, so a stale reading could be served as the new one.",
    )
    // The key has to move because the sheet does. A key that moved on its own would mean the
    // fingerprint is reading something cosmetic, and the assertion above would pass for the
    // wrong reason.
    assert.notDeepEqual(
      swapped.bundle.stats,
      worn.bundle.stats,
      "The swapped and worn sheets are identical, so the key difference above was not the gear.",
    )
  })

  it("leaves the sheet's own overrides out of the bundle key when nothing is overridden", async () => {
    const { rotation, context, presets } = await fixture()
    const plain = buildMeasurement({ build: presetEntry(presets[0].id), gearItems: [], context, rotation })
    const withEmptyOverrides: MeasurementContext = {
      ...context,
      buildSetupOverrides: { buildId: "some-other-build", overrides: {} },
    }
    const same = buildMeasurement({
      build: presetEntry(presets[0].id),
      gearItems: [],
      context: withEmptyOverrides,
      rotation,
    })
    assert.equal(same.cacheKey, plain.cacheKey, "An empty override changed what a build measures to.")
  })
})

/** The store writes on load, so it needs somewhere durable to write to. */
function createStorage() {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    setItem: (key: string, value: string) => void values.set(key, String(value)),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  }
}

async function loadoutStore(stored?: string) {
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage }
  const localStorage = createStorage()
  if (stored !== undefined) localStorage.setItem("wwm-global-debuffs-session-v1", stored)
  globalThis.window = { localStorage, sessionStorage: createStorage() } as never
  globalThis.localStorage = localStorage as never
  globalThis.sessionStorage = createStorage() as never
  vi.resetModules()
  const store = await import("@/stores/loadoutStore.ts")
  return {
    ...store,
    restore: () => {
      globalThis.window = previous.window as never
      globalThis.localStorage = previous.localStorage as never
    },
  }
}

describe("global debuff selection", () => {
  /**
   * The selection is part of the measurement's environment, so it has to reach the cache key: a
   * build measured with a debuff on is not the same measurement as one measured without it. The
   * second half is the reason `loadoutStore` holds it: the context holds the selection by
   * reference and feeds it to dependency arrays, so re-reading it must not look like a change.
   */
  it("reaches the measurement key when it changes and not when it is merely re-read", async () => {
    const { rotation, context, presets } = await fixture()
    // A saved session, so the load path is covered as well as the mutator.
    const { useLoadoutStore, restore } = await loadoutStore(JSON.stringify({ vulnerable: true }))
    try {
      useLoadoutStore.getState().initialise(false)
      const read = () =>
        buildMeasurement({
          build: presetEntry(presets[0].id),
          gearItems: [],
          rotation,
          context: {
            ...context,
            environment: { ...context.environment, globalDebuffs: useLoadoutStore.getState().globalDebuffs },
          },
        }).cacheKey

      const loaded = read()
      assert.equal(read(), loaded, "Re-reading the selection changed what a build measures to.")

      useLoadoutStore.getState().setGlobalDebuffs("vulnerable", false)
      const cleared = read()
      assert.notEqual(cleared, loaded, "Turning a saved global debuff off did not change what a build measures to.")
    } finally {
      restore()
    }
  })
})
