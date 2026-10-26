import type { PathId } from "@/application/contracts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { getPersistentItem, setPersistentItem } from "@/persistentStorage"
import { parseJson } from "@/schemas/json"
import { pathSelectionSchema } from "@/schemas/storage"

import { readLegacyPathSelection } from "./legacy"
import { migrateWingsPathId } from "./legacy/wingsPath"

export type PathSelectionIds = Partial<Record<PathId, string>>

// `empty` is the shared placeholder preset (data/build/empty.json, data/rotation/empty.json) that paths
// without real presets point at. A stored placeholder therefore records "this path was opened while it had
// no build or rotation", not a deliberate pick, so it is discarded on read and the path's current default
// applies. Without this, a path that ships its first real build or rotation while still WIP keeps resolving
// the placeholder for every visitor from before, because a stored selection outranks the path default.
export const placeholderSelectionId = "empty"

function isRestorableSelectionId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id !== placeholderSelectionId
}

export function loadPathSelectionIds(storageKey: string, legacyStorageKey: string, currentPathId: PathId) {
  migrateWingsPathId()
  const parsed = parseJson(pathSelectionSchema, getPersistentItem(storageKey) ?? "null")
  const stored: PathSelectionIds = parsed.success
    ? (Object.fromEntries(
        Object.entries(parsed.output).filter(
          ([path, id]) => path in typedPathDefinitions && isRestorableSelectionId(id),
        ),
      ) as PathSelectionIds)
    : {}
  if (stored[currentPathId]) return stored
  const legacyId = readLegacyPathSelection(legacyStorageKey)
  if (!isRestorableSelectionId(legacyId)) return stored
  const promoted = { ...stored, [currentPathId]: legacyId }
  setPersistentItem(storageKey, JSON.stringify(promoted))
  return promoted
}

export function withPathSelection(selections: PathSelectionIds, pathId: PathId, id: string) {
  return selections[pathId] === id ? selections : { ...selections, [pathId]: id }
}
