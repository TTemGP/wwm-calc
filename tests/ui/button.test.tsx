// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Button } from "../../src/ui/Button"

describe("Button", () => {
  let container: HTMLDivElement
  let root: Root

  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  async function renderButton(props: Parameters<typeof Button>[0]) {
    await act(async () => {
      root.render(<Button {...props} />)
    })
    const button = container.querySelector("button")
    if (!button) throw new Error("Button did not render a button element.")
    return button
  }

  it("renders children inside a native button", async () => {
    const button = await renderButton({ children: "Confirm" })
    expect(button.textContent).toBe("Confirm")
  })

  it("defaults to type button so it never submits a surrounding form", async () => {
    const button = await renderButton({ children: "Confirm" })
    expect(button.getAttribute("type")).toBe("button")
  })

  it("respects an explicit type override", async () => {
    const button = await renderButton({ children: "Confirm", type: "submit" })
    expect(button.getAttribute("type")).toBe("submit")
  })

  it("exposes a primitive marker and keeps application layout classes", async () => {
    const button = await renderButton({
      children: "Confirm",
      variant: "primary",
      size: "small",
      className: "dialog-action",
    })
    expect(button.hasAttribute("data-button")).toBe(true)
    expect(button.hasAttribute("variant")).toBe(false)
    expect(button.hasAttribute("size")).toBe(false)
    expect(button.getAttribute("class")).toContain("dialog-action")
  })

  it("forwards interaction props and honors disabled", async () => {
    const onClick = vi.fn<() => void>()
    const button = await renderButton({ children: "Confirm", onClick, disabled: true })
    expect(button.disabled).toBe(true)
    button.click()
    expect(onClick).not.toHaveBeenCalled()
  })

  it("reports clicks and forwards aria props", async () => {
    const onClick = vi.fn<() => void>()
    const button = await renderButton({ children: "Confirm", onClick, "aria-label": "Confirm dialog" })
    expect(button.getAttribute("aria-label")).toBe("Confirm dialog")
    await act(async () => {
      button.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
