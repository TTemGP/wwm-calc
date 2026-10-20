import { expect, it } from "vitest"

import { exportRotationEntries, mergeImportedRotationEntries } from "../src/rotationTransfer"

it.each([undefined, null, -1, 0, "3", Number.NaN, Number.POSITIVE_INFINITY])(
  "defaults invalid or legacy enemy count %s to one on import",
  enemyCount => {
    const result = mergeImportedRotationEntries([], {
      format: "where-builds-meet-rotations",
      version: 9,
      rotations: [{ id: "count", rotation: { name: "Count", steps: [], enemyCount } }],
    })
    expect(result.entries[0].rotation.enemyCount).toBe(1)
  },
)
it("preserves enemy count through rotation export and import", () => {
  const exported = exportRotationEntries([
    { id: "count", martialArts: ["everspring", "unfettered"], rotation: { name: "Count", steps: [], enemyCount: 3 } },
  ])
  expect(mergeImportedRotationEntries([], JSON.parse(exported)).entries[0].rotation.enemyCount).toBe(3)
})
