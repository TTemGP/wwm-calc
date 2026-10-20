import { act } from "react"
import { expect, vi } from "vitest"

/**
 * Opens the rotation editor tab and waits for it to render.
 *
 * The editor is loaded on demand, so opening its tab suspends while its module arrives, and that
 * module resolves on the real event loop — which the fake clock these tests run on does not drive.
 * Loading it here and then letting the suspended render finish is what makes the editor available
 * to assert against. Anything that opens the editor awaits this rather than assuming the editor is
 * already on screen, which is the one behaviour deferring the module changed.
 */
export async function openRotationEditorTab(container: HTMLElement, openTab: () => Promise<void>) {
  await openTab()
  await act(async () => {
    await import("@/features/rotations/RotationEditorTab")
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(container.querySelector(".rotation-editor-panel"), "the rotation editor did not finish loading").not.toBeNull()
}
