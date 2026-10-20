import { describe, expect, it } from "vitest"

import dustBuffs from "../data/buff/bamboocut-dust.json"
import strengthBuffs from "../data/buff/stonesplit-strength.json"
import { visibleTimelineEffects } from "../src/rotationDisplay"

const definitions = { ...dustBuffs, ...strengthBuffs } as Record<string, { hidden?: boolean }>

describe("timeline effect visibility", () => {
  it("omits internal bookkeeping counters while keeping real effects", () => {
    const effects = [
      { name: "PhantomUmbrellaThrow", stack: 2 },
      { name: "PhantomUmbrella", stack: 1 },
      { name: "Cadence", stack: 1 },
      { name: "Riposte", stack: 1 },
    ]
    expect(visibleTimelineEffects(effects, definitions).map(effect => effect.name)).toEqual([
      "PhantomUmbrella",
      "Riposte",
    ])
  })

  it("keeps effects that have no definition at all", () => {
    const effects = [{ name: "UnknownFromAnUnloadedCatalog" }]
    expect(visibleTimelineEffects(effects, definitions)).toEqual(effects)
  })

  it("hides a counter even when it is the only effect on the row", () => {
    expect(visibleTimelineEffects([{ name: "PhantomUmbrellaThrow" }], definitions)).toEqual([])
  })
})
