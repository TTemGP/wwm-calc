import * as v from "valibot"

import type { CharacterStatOverrides } from "../../calculations/statEffects"
import { allStatDefinitions, emptyStats } from "../../data/statDefinitions"
import { getPersistentItem } from "../../persistentStorage"
import { parseJson } from "../../schemas/json"
import type { CharacterStats } from "../../types"
import { characterStatsStorageKey, statOverrideStorageKey } from "./keys"
import { readLegacyCharacterStats } from "./legacy"

const percentageStatKeys = new Set<keyof CharacterStats>(
  allStatDefinitions.filter(({ unit }) => unit === "%").map(({ key }) => key),
)
const statDefinitionByKey = new Map(allStatDefinitions.map(definition => [definition.key, definition]))

export function statDefinition(key: keyof CharacterStats) {
  const definition = statDefinitionByKey.get(key)
  if (!definition) throw new Error(`Missing stat definition for ${key}.`)
  return definition
}

export function loadStats(): CharacterStats {
  const currentSaved = getPersistentItem(characterStatsStorageKey)
  const isLegacy = currentSaved === null
  let saved: Record<string, unknown> | undefined
  if (isLegacy) {
    saved = readLegacyCharacterStats()
  } else {
    const parsed = parseJson(v.looseObject({}), currentSaved)
    saved = parsed.success ? (parsed.output as Record<string, unknown>) : undefined
  }
  if (!saved) return { ...emptyStats }
  const values = saved as Partial<CharacterStats> & Record<string, unknown> & { attributeDmgBonus?: unknown }
  const legacyAttributeBonus =
    typeof values.attributeDmgBonus === "number" && Number.isFinite(values.attributeDmgBonus)
      ? values.attributeDmgBonus / (isLegacy ? 100 : 1)
      : 0
  const pathBonusKeys = new Set<keyof CharacterStats>([
    "bellstrikeDmgBonus",
    "stonesplitDmgBonus",
    "silkbindDmgBonus",
    "bamboocutDmgBonus",
  ])
  const legacyPenetrationKeys: Partial<Record<keyof CharacterStats, string>> = {
    bellstrikePenetration: "bellstrikePen",
    silkbindPenetration: "silkbindPen",
    stonesplitPenetration: "stonesplitPen",
    bamboocutPenetration: "bamboocutPen",
  }
  return Object.fromEntries(
    allStatDefinitions.map(({ key }) => {
      const savedValue = values[key] ?? (legacyPenetrationKeys[key] ? values[legacyPenetrationKeys[key]!] : undefined)
      const hasSavedValue = typeof savedValue === "number" && Number.isFinite(savedValue)
      const value = hasSavedValue ? savedValue : pathBonusKeys.has(key) ? legacyAttributeBonus : 0
      return [key, isLegacy && hasSavedValue && percentageStatKeys.has(key) ? value / 100 : value]
    }),
  ) as CharacterStats
}

export function loadStatOverrides(): CharacterStatOverrides {
  const currentSaved = getPersistentItem(statOverrideStorageKey)
  if (currentSaved !== null) {
    const values = parseJson(v.record(v.string(), v.unknown()), currentSaved)
    if (!values.success) return {}
    return Object.fromEntries(
      allStatDefinitions.flatMap(({ key }) => {
        const value = values.output[key]
        return typeof value === "number" && Number.isFinite(value) ? [[key, value]] : []
      }),
    ) as CharacterStatOverrides
  }
  return Object.fromEntries(Object.entries(loadStats()).filter(([, value]) => value !== 0)) as CharacterStatOverrides
}
