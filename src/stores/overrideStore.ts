import { create } from "zustand"

import { loadAttunementOverrides } from "@/application/persistence/attunements"
import { attunementOverrideStorageKey, statOverrideStorageKey } from "@/application/persistence/keys"
import { loadStatOverrides } from "@/application/persistence/stats"
import type { AttunementOverrides } from "@/calculations/attunementStats"
import type { AttunementStats } from "@/calculations/damage"
import type { CharacterStatOverrides } from "@/calculations/statEffects"
import { setPersistentItem } from "@/persistentStorage"
import type { CharacterStats } from "@/types"

/**
 * The numbers the user has overridden on the character sheet.
 *
 * These are a third group of measurement inputs, and they are a group of their own: the weapons,
 * ping and setup in `loadoutStore` are what the user brings to the fight, while these are the
 * values typed over the top of it. `MeasurementContext` in `rotationCalculationBundle.ts` holds
 * them as two top-level fields beside `environment` rather than inside it, which is why they do
 * not belong in `loadoutStore` and why this store is not part of that environment group.
 *
 * A key that is absent is one the user has not overridden, and a stat the user did not override
 * inherits from the game data. That is why `reset*` removes the key rather than writing a zero,
 * and why the character sheet can tell a modified field from an untouched one by key presence.
 *
 * Read with selectors, like `loadoutStore` and unlike the calculation cache in `dpsStore`: the
 * sheet mirrors these values, so a component displaying one should re-render when it moves.
 * Every mutator stores what it sets, so state and storage cannot drift apart.
 */
export type OverrideStore = {
  statOverrides: CharacterStatOverrides
  attunementOverrides: AttunementOverrides

  /**
   * Reads the stored overrides.
   *
   * The store is a module singleton, so reading storage while it is being defined would make its
   * contents depend on when the module happened to be imported. The application boots it
   * explicitly instead, once per mount, before anything reads it.
   *
   * Nothing is passed in, because neither loader depends on the development toggle or on the
   * selected path: both read one key and fall back to an older one, so the store can be booted
   * alongside `settingsStore` rather than after it.
   */
  initialise: () => void
  setStatOverride: (key: keyof CharacterStats, value: number) => void
  resetStatOverride: (key: keyof CharacterStats) => void
  setAttunementOverride: (key: keyof AttunementStats, value: number) => void
  resetAttunementOverride: (key: keyof AttunementStats) => void
  /**
   * Replaces both at once, which is what applying or clearing a character profile does. One call
   * so the two records cannot be written by two separate actions and read back half-applied.
   */
  setOverrides: (input: { statOverrides: CharacterStatOverrides; attunementOverrides: AttunementOverrides }) => void
}

export const useOverrideStore = create<OverrideStore>()((set, get) => ({
  statOverrides: {},
  attunementOverrides: {},

  initialise: () => set({ statOverrides: loadStatOverrides(), attunementOverrides: loadAttunementOverrides() }),

  setStatOverride: (key, value) => writeStatOverrides({ ...get().statOverrides, [key]: value }),

  resetStatOverride: key => {
    const next = { ...get().statOverrides }
    delete next[key]
    writeStatOverrides(next)
  },

  setAttunementOverride: (key, value) => writeAttunementOverrides({ ...get().attunementOverrides, [key]: value }),

  resetAttunementOverride: key => {
    const next = { ...get().attunementOverrides }
    delete next[key]
    writeAttunementOverrides(next)
  },

  setOverrides: ({ statOverrides, attunementOverrides }) => {
    writeStatOverrides(statOverrides)
    writeAttunementOverrides(attunementOverrides)
  },
}))

/**
 * Stores the overrides even when the last key is gone.
 *
 * An absent record is not the same as an empty one: `loadStatOverrides` and
 * `loadAttunementOverrides` both fall back to the pre-override keys when their own record is
 * missing, so removing the record to mean "nothing overridden" would resurrect the values an
 * older session stored there. An empty record is what says the user has overridden nothing.
 */
function writeStatOverrides(statOverrides: CharacterStatOverrides) {
  setPersistentItem(statOverrideStorageKey, JSON.stringify(statOverrides))
  useOverrideStore.setState({ statOverrides })
}

function writeAttunementOverrides(attunementOverrides: AttunementOverrides) {
  setPersistentItem(attunementOverrideStorageKey, JSON.stringify(attunementOverrides))
  useOverrideStore.setState({ attunementOverrides })
}
