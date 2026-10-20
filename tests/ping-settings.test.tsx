// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { assert, afterEach, beforeEach, expect, it, vi } from "vitest"

import App from "@/App"
import { bossDefinitions } from "@/calculations/combatDefaults"
import { initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"
import { dpsBundles, resetDpsMock } from "./helpers/dpsStoreMock"
import { openRotationEditorTab } from "./helpers/rotationEditorTab"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true
beforeEach(async () => {
  resetDpsMock()
  localStorage.clear()
  sessionStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
    })),
  )
  await initializeI18n()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
/** Finds a button by its visible text, or by its accessible name when it carries only an icon. */
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    node => node.textContent?.trim() === text || node.getAttribute("aria-label") === text,
  )
  assert(button !== undefined, text)
  await act(async () => button!.click())
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function commit(input: HTMLInputElement, trigger: "enter" | "blur" = "blur") {
  await act(async () => {
    if (trigger === "enter") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    else input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  })
}
it("persists Settings ping, fixes preset ping, and resets custom overrides to inheritance", async () => {
  await act(async () => root.render(<App />))
  await click("Settings")
  const control = () => container.querySelector(".settings-panel input[type=number]") as HTMLInputElement
  expect(control().value).toBe("40")
  await fill(control(), "")
  expect(control().value).toBe("")
  expect(JSON.parse(localStorage.getItem("wwm-settings-session-v1")!).ping).toBe(40)
  await fill(control(), "1000")
  expect(control().value).toBe("1000")
  await commit(control(), "enter")
  expect(control().value).toBe("999")
  await fill(control(), "-5")
  expect(control().value).toBe("-5")
  await commit(control())
  expect(control().value).toBe("0")
  await fill(control(), "")
  expect(control().value).toBe("")
  await fill(control(), "85")
  await commit(control())
  expect(JSON.parse(localStorage.getItem("wwm-settings-session-v1")!).ping).toBe(85)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
  const bundles = [...dpsBundles("baseline"), ...dpsBundles("editorTimeline")]
  expect(bundles.some(bundle => bundle.timeline.rotation.ping === 40)).toBe(true)
  expect(bundles.some(bundle => bundle.timeline.rotation.ping === 85)).toBe(false)
  await act(async () => root.unmount())
  root = createRoot(container)
  await act(async () => root.render(<App />))
  await click("Settings")
  expect(control().value).toBe("85")
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  const presetPing = container.querySelector(".rotation-ping-field")!
  expect(presetPing.querySelector("input")?.disabled).toBe(true)
  expect(presetPing.querySelector("input")?.value).toBe("40")
  expect(presetPing.querySelector(".stat-reset-button")).toBeNull()
  expect(presetPing.previousElementSibling?.textContent).toContain("Enemy Count")
  await click("Duplicate")
  let customPing = container.querySelector(
    'input[title="Leave blank to use the ping from Settings."]',
  ) as HTMLInputElement
  expect(customPing.disabled).toBe(false)
  await fill(customPing, "1000")
  expect(customPing.value).toBe("1000")
  await commit(customPing)
  expect(customPing.value).toBe("999")
  await fill(customPing, "-5")
  await commit(customPing, "enter")
  expect(customPing.value).toBe("0")
  expect(customPing.closest("label")?.classList.contains("modified-field")).toBe(true)
  await click("Save")
  const rotations = JSON.parse(localStorage.getItem("wwm-rotation-list-session-v1")!)
  expect(rotations.some((entry: { rotation: { ping?: number } }) => entry.rotation.ping === 0)).toBe(true)
  const reset = customPing.closest("label")!.querySelector<HTMLButtonElement>(".stat-reset-button")!
  expect(reset).toBeDefined()
  await act(async () => reset.click())
  customPing = container.querySelector(".rotation-ping-field input") as HTMLInputElement
  expect(customPing.closest("label")?.classList.contains("modified-field")).toBe(false)
  expect(customPing.closest("label")?.querySelector(".stat-reset-button")).toBeNull()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
  expect(dpsBundles("editorTimeline").some(bundle => bundle.timeline.rotation.ping === 85)).toBe(true)
  expect(customPing.value).toBe("")
  expect(customPing.placeholder).toBe("85")
  const pendingRequests = dpsBundles("editorTimeline").length
  await fill(customPing, "45")
  expect(customPing.closest("label")?.classList.contains("modified-field")).toBe(true)
  expect(customPing.closest("label")?.querySelector(".stat-reset-button")).not.toBeNull()
  expect(dpsBundles("editorTimeline")).toHaveLength(pendingRequests)
  expect(container.textContent).not.toContain("Calculating timeline")
  await commit(customPing, "enter")
  expect(customPing.closest("label")?.querySelector(".stat-reset-button")).not.toBeNull()
  expect(container.textContent).not.toContain("Calculating timeline")
})

it("defaults Enemy Count to one before Ping and persists edits into worker requests", async () => {
  await act(async () => root.render(<App />))
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  const getInput = () => container.querySelector<HTMLInputElement>(".rotation-enemy-count input")!
  expect(getInput().value).toBe("1")
  expect(getInput().disabled).toBe(true)
  expect(container.querySelector(".rotation-ping-field")?.previousElementSibling?.textContent).toContain("Enemy Count")
  await click("Duplicate")
  expect(getInput().disabled).toBe(false)
  await fill(getInput(), "3.8")
  await commit(getInput(), "enter")
  expect(getInput().value).toBe("3")
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
  expect(dpsBundles("editorTimeline").some(bundle => bundle.timeline.rotation.enemyCount === 3)).toBe(true)
  await click("Save")
  const saved = JSON.parse(localStorage.getItem("wwm-rotation-list-session-v1")!)
  expect(saved.some((entry: { rotation: { enemyCount?: number } }) => entry.rotation.enemyCount === 3)).toBe(true)
  await fill(getInput(), "")
  await commit(getInput())
  expect(getInput().value).toBe("1")
})

it("selects the practice target, orders it before Infinite Vitality, and persists it", async () => {
  await act(async () => root.render(<App />))
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  const select = () => container.querySelector<HTMLSelectElement>(".rotation-target-select select")!
  expect([...select().options].map(option => option.value)).toEqual(bossDefinitions.map(definition => definition.id))
  expect([...select().options].map(option => option.textContent)).toEqual(["Dummy", "Dummy (Attack)", "Boss"])
  expect(select().disabled).toBe(true)
  expect(container.querySelector(".rotation-target-select")?.nextElementSibling?.textContent).toContain(
    "Infinite Vitality",
  )
  await click("Duplicate")
  expect(select().disabled).toBe(false)
  await act(async () => {
    select().value = "Boss"
    select().dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(300)
  })
  expect(select().value).toBe("Boss")
  expect(dpsBundles("editorTimeline").some(bundle => bundle.timeline.rotation.targetType === "Boss")).toBe(true)
  await click("Save")
  const saved = JSON.parse(localStorage.getItem("wwm-rotation-list-session-v1")!)
  expect(saved.some((entry: { rotation: { targetType?: string } }) => entry.rotation.targetType === "Boss")).toBe(true)
  await act(async () => {
    select().value = "DummyAttack"
    select().dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(300)
  })
  await click("Save")
  const resaved = JSON.parse(localStorage.getItem("wwm-rotation-list-session-v1")!)
  expect(
    resaved.some((entry: { rotation: { targetType?: string } }) => entry.rotation.targetType === "DummyAttack"),
  ).toBe(true)
})
