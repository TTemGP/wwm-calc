// @vitest-environment jsdom
import { act, type ChangeEvent } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Toggle } from "../../src/ui/Toggle"

describe("Toggle", () => {
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

  const render = async (props: { checked: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) => {
    await act(async () => root.render(<Toggle aria-label="Share inventory" {...props} />))
    const toggle = container.querySelector("input")
    if (!(toggle instanceof HTMLInputElement)) throw new Error("Toggle did not render.")
    return toggle
  }

  it("is a checkbox announced as a switch, so assistive technology gets the on and off vocabulary", async () => {
    const onChange = vi.fn<(event: ChangeEvent<HTMLInputElement>) => void>()
    const toggle = await render({ checked: false, onChange })
    expect(toggle.type).toBe("checkbox")
    expect(toggle.getAttribute("role")).toBe("switch")
    expect(toggle.getAttribute("aria-label")).toBe("Share inventory")
  })

  it("follows a change to `checked` that no click produced", async () => {
    const onChange = vi.fn<(event: ChangeEvent<HTMLInputElement>) => void>()
    const toggle = await render({ checked: false, onChange })
    // Re-rendering, not clicking. A click sets the DOM checkedness itself, so a click-driven
    // assertion passes even when the component never forwards `checked` to the input, leaving
    // it uncontrolled with a thumb that never moves. Only a change the component has to apply
    // itself reaches that failure, which is the one a setting driven by a store produces when
    // something other than the pointer changes it.
    await act(async () => {
      root.render(<Toggle aria-label="Share inventory" checked onChange={onChange} />)
    })
    // One prop drives the drawn state and the announced one, so a screen reader cannot be told
    // the opposite of what the thumb shows.
    expect(toggle.checked).toBe(true)
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    expect(onChange).not.toHaveBeenCalled()
    await act(async () => {
      root.render(<Toggle aria-label="Share inventory" checked={false} onChange={onChange} />)
    })
    expect(toggle.checked).toBe(false)
    expect(toggle.getAttribute("aria-checked")).toBe("false")
  })

  it("reports the next state rather than the current one, so the caller does not re-read the DOM", async () => {
    // Read inside the handler. React restores a controlled input to `checked` once the handler
    // returns, so the DOM says `false` again by the time the assertion runs. A caller reads
    // `event.target.checked` at call time, so that is what has to be right.
    const reported: boolean[] = []
    const toggle = await render({
      checked: false,
      onChange: event => {
        reported.push(event.target.checked)
      },
    })
    await act(async () => toggle.click())
    expect(reported).toEqual([true])
  })

  it("forwards the native control attributes a form and a label depend on", async () => {
    const toggle = await render({ checked: false, onChange: () => {} })
    await act(async () => {
      root.render(
        <Toggle
          aria-label="Share inventory"
          checked={false}
          onChange={() => {}}
          id="share-inventory"
          name="share"
          disabled
        />,
      )
    })
    expect(toggle.id).toBe("share-inventory")
    expect(toggle.name).toBe("share")
    expect(toggle.disabled).toBe(true)
    // `type` is the component's to own, and `Omit<..., "type">` is what keeps a caller from
    // passing one: a stray `type` would otherwise turn the switch into a text field.
    expect(toggle.type).toBe("checkbox")
  })
})
