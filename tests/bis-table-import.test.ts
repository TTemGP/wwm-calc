import { existsSync } from "node:fs"

import { assert, describe, it } from "vitest"

import { cellBox, findTableGrids, type RawImage } from "@/bisTableGrid"
import {
  gearItemsFromBisDraft,
  interpretBisTable,
  matchAffixText,
  matchAttunementText,
  weaponColumnsSwapped,
  type BisImportContext,
} from "@/bisTableImport"
import { refreshBuildFromImport } from "@/features/build/refreshImportedBuild"
import type { BuildState } from "@/gear"

const wing: BisImportContext = {
  weapons: ["museflowWaistDrum", "willowbendFan"],
  pathTag: "SilkbindWing",
  attribute: "Silkbind",
  level: 96,
}
const strength: BisImportContext = {
  weapons: ["snowparting", "phalanxbane"],
  pathTag: "StonesplitStrength",
  attribute: "Stonesplit",
  level: 96,
}

// 아카라이브 견사(익) 최대외공 표를 OCR로 읽었을 때와 같은 글자(북 칸은 OCR이 놓친 그대로).
const wingTable = {
  label: "최대외공빌드",
  cells: [
    ["부채", "", "환", "패물", "투구", "흉갑", "경갑", "완갑"],
    ["최대외공", "최대외공", "최대외공", "최대외공", "치명타", "정확도", "내공", "내공"],
    ["최대외공", "최대외공", "최대외공", "최대외공", "최대외공", "최대외공", "최대외공", "최대외공"],
    ["내공", "내공", "내공", "내공", "내공", "내공", "내공", "내공"],
    ["민첩", "북피증", "전무증", "전무증", "치명타", "치명타", "보피증", "보피증"],
    ["치명타", "치명타", "치명타", "치명타", "정확도", "정확도", "치명타", "치명타"],
  ],
}

function drawGrid(): RawImage {
  const width = 900
  const height = 400
  const pixels = new Uint8ClampedArray(width * height * 4).fill(240)
  const dark = (x: number, y: number) => pixels.fill(20, (y * width + x) * 4, (y * width + x) * 4 + 3)
  const rows = [50, 90, 130, 170, 210, 250, 290]
  const columns = [20, 125, 230, 335, 440, 545, 650, 755, 860]
  for (const y of rows) for (let x = columns[0]; x <= columns[8]; x++) for (const t of [0, 1]) dark(x, y + t)
  for (const x of columns) for (let y = rows[0]; y <= rows[6]; y++) for (const t of [0, 1]) dark(x + t, y)
  // 두꺼운 붉은 띠는 선으로 세면 안 돼요.
  for (let y = 320; y < 360; y++) for (let x = 20; x < 860; x++) pixels.set([170, 20, 20], (y * width + x) * 4)
  return { width, height, pixels }
}

describe("bis-table-import", () => {
  it("finds the 6 × 8 grid and ignores thick banners", () => {
    const grids = findTableGrids(drawGrid())
    assert.equal(grids.length, 1)
    assert.equal(grids[0].rows.length, 7)
    assert.equal(grids[0].columns.length, 9)
    const box = cellBox(grids[0], 1, 2)
    assert.isAbove(box.left, 230)
    assert.isBelow(box.left + box.width, 335)
  })

  it("maps table words to affix keys and tolerates OCR slips", () => {
    assert.equal(matchAffixText("최대외공").key, "maxPhys")
    assert.equal(matchAffixText("최소 외공").key, "minPhys")
    assert.equal(matchAffixText("치명다").key, "crit")
    assert.equal(matchAffixText("전무증").key, "allMartialArts")
    assert.equal(matchAffixText("보피증").key, "vsBossDmg")
    assert.equal(matchAffixText("맥무증").key, "moBladeDmgBoost")
    assert.equal(matchAffixText("최대견사").key, "maxSilkbind")
    assert.isUndefined(matchAffixText("").key)
  })

  it("reads attunements from the header text", () => {
    const header = "정확도 100% 80% 정확도 외공관통 북특수 스킬 (일반 치명타 기준)"
    assert.equal(
      matchAttunementText(header, ["physicalPenetration", "formlessPenetration"], wing.weapons),
      "physicalPenetration",
    )
    assert.equal(
      matchAttunementText(
        header,
        ["museflowWaistDrumMartialBoost", "museflowWaistDrumSpecialBoost", "willowbendFanMartialBoost"],
        wing.weapons,
      ),
      "museflowWaistDrumSpecialBoost",
    )
    assert.equal(
      matchAttunementText(
        "외공간통 맥도차지피해",
        ["phalanxbaneChargedBoost", "snowpartingChargedBoost"],
        strength.weapons,
      ),
      "phalanxbaneChargedBoost",
    )
  })

  it("puts the fan column on the fan hand", () => {
    assert.isTrue(weaponColumnsSwapped(["부채", ""], wing.weapons))
    assert.isFalse(weaponColumnsSwapped(["횡도", "맥도"], strength.weapons))
  })

  it("turns a read table into max-roll gear", () => {
    const draft = interpretBisTable(wingTable, "외공관통 북특수스킬", wing)
    assert.equal(draft.slots.rightWeapon.lines[3].key, "agility", "The fan column belongs to Willowbend Fan.")
    assert.equal(draft.slots.leftWeapon.lines[3].key, "ribbonAndDrumDmgBoost")
    assert.equal(draft.slots.helmet.attunement, "museflowWaistDrumSpecialBoost")
    assert.equal(draft.slots.disc.attunement, "physicalPenetration")
    const created = gearItemsFromBisDraft(draft, wing, slot => `test:${slot}`)
    assert(!("problems" in created), JSON.stringify(created))
    assert.equal(created.items.length, 8)
    const helmet = created.items.find(item => item.id === "test:helmet")!
    assert.equal(helmet.baseAffix.key, "crit")
    assert.deepEqual(
      helmet.additionalAffixes.map(affix => affix.key),
      ["maxPhys", "power", "crit", "precision"],
    )
    assert.isAbove(helmet.baseAffix.value, 0)
    assert.equal(created.equipped.helmet, "test:helmet")
  })

  it("reports duplicated extra lines instead of building bad gear", () => {
    const draft = interpretBisTable(wingTable, "", wing)
    draft.slots.helmet.lines[2] = { text: "", key: "maxPhys", guessed: false }
    const created = gearItemsFromBisDraft(draft, wing, slot => slot)
    assert("problems" in created)
    assert.deepEqual(created.problems, [{ slot: "helmet", reason: "duplicate" }])
  })

  it("refreshes an imported build in place", () => {
    const item = (id: string) => ({
      id,
      slot: "helmet" as const,
      definitionId: "helmet",
      level: 96 as const,
      rarity: "Gold" as const,
      baseAffix: { key: "crit", value: 0.09 },
      additionalAffixes: [],
    })
    const state: BuildState = {
      activeBuildId: "mine",
      gearItems: [item("old"), item("shared"), item("new")],
      entries: [
        { id: "mine", name: "강탈 Import", equipped: { helmet: "old" } },
        { id: "other", name: "Other", equipped: { helmet: "shared" } },
        { id: "imported", name: "Import", equipped: { helmet: "new" } },
      ],
    }
    const next = refreshBuildFromImport(state, "mine", "imported")
    assert.deepEqual(
      next.entries.map(entry => [entry.id, entry.name, entry.equipped?.helmet]),
      [
        ["mine", "강탈 Import", "new"],
        ["other", "Other", "shared"],
      ],
    )
    assert.deepEqual(
      next.gearItems.map(entry => entry.id),
      ["shared", "new"],
    )
  })
})

const fixtures = ["local/bis-table/silkbind-yi.jpg", "local/bis-table/stonesplit-strength.jpg"]
describe.runIf(fixtures.every(existsSync))("bis-table-image", () => {
  it("finds both tables in the arca screenshots", async () => {
    const sharp = (await import("sharp")).default
    const counts = await Promise.all(
      fixtures.map(async fixture => {
        const { data, info } = await sharp(fixture).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        return findTableGrids({ width: info.width, height: info.height, pixels: new Uint8ClampedArray(data) }).length
      }),
    )
    assert.deepEqual(counts, [2, 2])
  })
})
