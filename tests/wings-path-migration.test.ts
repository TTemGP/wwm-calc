// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"

import { loadGearScope } from "@/application/gearScope"
import {
  activeBuildByPathStorageKey,
  activeRotationByPathStorageKey,
  gearScopeStorageKey,
  pathStorageKey,
} from "@/application/persistence/keys"
import { loadPathSelectionIds } from "@/application/persistence/pathSelection"
import { loadSelectedPath } from "@/application/persistence/settings"

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

it("restores saved Wings path, selections, and scoped gear from the old path id", () => {
  sessionStorage.setItem(pathStorageKey, "silkbindWing")
  sessionStorage.setItem(activeBuildByPathStorageKey, JSON.stringify({ silkbindWing: "custom-build" }))
  sessionStorage.setItem(activeRotationByPathStorageKey, JSON.stringify({ silkbindWing: "custom-rotation" }))
  sessionStorage.setItem(
    gearScopeStorageKey,
    JSON.stringify({
      sharedInventory: false,
      sharedBuilds: false,
      itemIdsByPath: { silkbindWing: ["owned-item"] },
      buildIdsByPath: { silkbindWing: ["custom-build"] },
    }),
  )

  expect(loadSelectedPath()).toBe("silkbindWings")
  expect(loadPathSelectionIds(activeBuildByPathStorageKey, "unused", "silkbindWings")).toEqual({
    silkbindWings: "custom-build",
  })
  expect(loadPathSelectionIds(activeRotationByPathStorageKey, "unused", "silkbindWings")).toEqual({
    silkbindWings: "custom-rotation",
  })
  expect(loadGearScope()).toMatchObject({
    itemIdsByPath: { silkbindWings: ["owned-item"] },
    buildIdsByPath: { silkbindWings: ["custom-build"] },
  })
  expect(localStorage.getItem(pathStorageKey)).toBe("silkbindWings")
  expect(JSON.parse(localStorage.getItem(gearScopeStorageKey)!)).not.toHaveProperty("itemIdsByPath.silkbindWing")
})

it("retains a newer Wings selection if both path keys were saved", () => {
  localStorage.setItem(activeBuildByPathStorageKey, JSON.stringify({ silkbindWing: "old", silkbindWings: "new" }))
  expect(loadPathSelectionIds(activeBuildByPathStorageKey, "unused", "silkbindWings")).toEqual({ silkbindWings: "new" })
})
