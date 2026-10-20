// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ThroughputReading } from "@/calculations/rotationWorkerTransport"
import { GearDelta } from "@/features/build/GearDelta"
import { initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"

/**
 * A card states what swapping in its item would do to the build. The number is a decision aid, so
 * the failure that matters is a wrong one rather than a missing one: a reader who sees `0` where the
 * item was never measured will skip an upgrade that helps, and a reader who sees a green number
 * where the difference rounds to nothing will take a downgrade for an improvement.
 */

const reading = (dps: number): ThroughputReading => ({ dps, hps: 0, totalDamage: dps * 60 })

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(async () => {
  globalThis.fetch = (async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
    text: async () => "{}",
  })) as typeof fetch
  await initializeI18n()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function show(props: { reading?: ThroughputReading; reference?: ThroughputReading }) {
  await act(async () => root.render(<GearDelta {...props} />))
  return {
    text: container.textContent?.trim() ?? "",
    /** The colour class, which is what a reader who cannot see the number relies on. */
    tone: [...container.querySelectorAll("span")].map(node => node.className).join(" "),
  }
}

describe("a candidate that has not been measured", () => {
  it("says nothing rather than claiming no change", async () => {
    const shown = await show({ reference: reading(1000) })
    // `0` would read as "this item is worth nothing", which is a claim nobody has measured yet.
    expect(shown.text).not.toContain("0")
    expect(shown.text).toBe("—")
  })

  it("says nothing when the item it is weighed against is still being measured", async () => {
    // The reference is the common one to be pending, and a candidate measured first would otherwise
    // be differenced against nothing.
    const shown = await show({ reading: reading(1200) })
    expect(shown.text).toBe("—")
  })

  it("says nothing when neither has been measured", async () => {
    expect((await show({})).text).toBe("—")
  })
})

describe("a measured candidate", () => {
  it("states the damage an upgrade would add, in the reader's own units", async () => {
    const shown = await show({ reading: reading(1750), reference: reading(1000) })
    // Signed and relative, since the absolute numbers are on the card and the question is the
    // difference between them.
    expect(shown.text).toMatch(/^\+.*DPS$/)
  })

  it("states a loss as a loss", async () => {
    const shown = await show({ reading: reading(800), reference: reading(1000) })
    expect(shown.text).toMatch(/^-/)
  })

  it("marks a gain and a loss differently, so the sign is not the only signal", async () => {
    const gain = await show({ reading: reading(2000), reference: reading(1000) })
    const loss = await show({ reading: reading(500), reference: reading(1000) })
    expect(gain.tone).toContain("damage-positive")
    expect(loss.tone).toContain("damage-negative")
    expect(gain.tone).not.toBe(loss.tone)
  })

  it("does not claim a direction for a difference too small to have one", async () => {
    // A difference below the last digit the reader is shown is the same number as far as they are
    // concerned, and a sign on it would be a direction nothing supports. The class and the text have
    // to agree, or the colouring would claim a change the number denies.
    const shown = await show({ reading: reading(1000.001), reference: reading(1000) })
    expect(shown.text).toBe("0 DPS")
    expect(shown.tone).toContain("throughput-neutral")
  })
})
