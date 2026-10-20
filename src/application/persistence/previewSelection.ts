import { getPersistentItem, removePersistentItem, setPersistentItem } from "@/persistentStorage"

import { isPreviewId, type PreviewId } from "../gameData/previews"
import { previewSelectionStorageKey } from "./keys"

/**
 * The selected preview, or `null` for the shipped data. A stored id this build does not
 * ship is discarded rather than honored, so removing a preview cannot leave a selection
 * that resolves against nothing.
 */
export function loadPreviewSelection(): PreviewId | null {
  const saved = getPersistentItem(previewSelectionStorageKey)
  return isPreviewId(saved) ? saved : null
}

export function persistPreviewSelection(previewId: PreviewId | null) {
  if (previewId) setPersistentItem(previewSelectionStorageKey, previewId)
  else removePersistentItem(previewSelectionStorageKey)
}
