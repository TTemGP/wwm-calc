import { getPersistentItem, setPersistentItem } from "@/persistentStorage"

import {
  activeBuildByPathStorageKey,
  activeRotationByPathStorageKey,
  gearScopeStorageKey,
  pathStorageKey,
} from "../keys"

const oldPathId = "silkbindWing"
const newPathId = "silkbindWings"

function renamePathKey(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value) || !(oldPathId in value)) return value
  const entries = value as Record<string, unknown>
  const { [oldPathId]: oldValue, ...rest } = entries
  return { ...rest, [newPathId]: Object.hasOwn(rest, newPathId) ? rest[newPathId] : oldValue }
}

function migrateMap(storageKey: string, nested = false) {
  const saved = getPersistentItem(storageKey)
  if (!saved) return
  let parsed: unknown
  try {
    parsed = JSON.parse(saved)
  } catch {
    return
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return
  let migrated: unknown
  if (nested) {
    const scope = parsed as Record<string, unknown>
    migrated = {
      ...scope,
      itemIdsByPath: renamePathKey(scope.itemIdsByPath),
      buildIdsByPath: renamePathKey(scope.buildIdsByPath),
    }
  } else migrated = renamePathKey(parsed)
  if (JSON.stringify(migrated) !== JSON.stringify(parsed)) setPersistentItem(storageKey, JSON.stringify(migrated))
}

/** Preserve Wings selections and gear scope before current loaders discard unknown path IDs. */
export function migrateWingsPathId() {
  if (getPersistentItem(pathStorageKey) === oldPathId) setPersistentItem(pathStorageKey, newPathId)
  migrateMap(activeBuildByPathStorageKey)
  migrateMap(activeRotationByPathStorageKey)
  migrateMap(gearScopeStorageKey, true)
}
