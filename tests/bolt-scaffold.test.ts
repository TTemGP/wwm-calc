// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"

import { pathIsSelectable, pathStatusLabel, typedPathDefinitions } from "@/application/gameData/paths"
import { pathStorageKey } from "@/application/persistence/keys"
import { loadSelectedPath } from "@/application/persistence/settings"
import { defaultRotationEntries, rotationAvailableForWeapons } from "@/application/rotationCatalog"
import { availableSetEntriesForTags, weaponSetDefinitions } from "@/gear"
import { t } from "@/i18n"
import { normalizeStoredWeaponIds, weaponIds } from "@/types"

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

// 연운 딜 계산기: 정(霆)은 사용자 확인 전까지 개발자 모드 전용으로 둬요(원작은 미리보기 공개).
it("keeps Bolt behind Dev mode in this fork", () => {
  const definition = typedPathDefinitions.bellstrikeBolt
  expect(pathIsSelectable(definition, false)).toBe(false)
  expect(pathIsSelectable(definition, true)).toBe(true)
  localStorage.setItem(pathStorageKey, "bellstrikeBolt")
  expect(loadSelectedPath(true)).toBe("bellstrikeBolt")
  expect(loadSelectedPath(false)).toBe("stonesplitStrength")
  expect(pathStatusLabel(definition)).toBe(t("ui.app.wip"))
  expect(pathIsSelectable(typedPathDefinitions.bellstrikeUmbra, false)).toBe(true)
  expect(pathIsSelectable(typedPathDefinitions.mixed, false)).toBe(false)
  expect(pathIsSelectable(typedPathDefinitions.mixed, true)).toBe(true)
})

it("offers Bolt's three weapon sets with its own spear pair", () => {
  const entries = availableSetEntriesForTags(
    weaponSetDefinitions,
    ["JueyuXuanfengSpear", "BoshanQuyueSpear"],
    "BellstrikeBolt",
  )
  expect(entries.map(([id]) => id).sort()).toEqual(["HanMang", "Hawkwing", "Jadeware"])
})

it("keeps the shared empty rotation usable and expands older universal weapon lists", () => {
  const weapons = typedPathDefinitions.bellstrikeBolt.lockedWeapons!
  const empty = defaultRotationEntries.find(entry => entry.id === "empty")!
  expect(rotationAvailableForWeapons(empty, weapons)).toBe(true)
  const previousUniversal = weaponIds.filter(id => !weapons.includes(id))
  expect(normalizeStoredWeaponIds(previousUniversal)).toEqual([...weaponIds])
  expect(normalizeStoredWeaponIds(["namelessSword", "namelessSpear"])).toEqual(["namelessSword", "namelessSpear"])
})
