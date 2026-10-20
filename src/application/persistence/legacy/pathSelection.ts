import { getPersistentItem } from "../../../persistentStorage"

export function readLegacyPathSelection(storageKey: string) {
  return getPersistentItem(storageKey)
}
