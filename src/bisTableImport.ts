// 연운 딜 계산기: BiS 조율표 이미지에서 읽은 글자를 계산기의 조율·정음 키로 바꾸고 빌드 장비로 만들어요.
// 표 양식은 아카라이브 "PVE 모든 유파 이상적 조율표" 기준: 머리글(무기1, 무기2, 환, 패물, 투구, 흉갑, 경갑, 완갑)
// 아래 조율 5줄. 첫 줄이 기본 조율, 나머지 4줄이 추가 조율이에요.

import {
  affixOptionsForGearDefinition,
  attunementData,
  attunementsForGearDefinition,
  gearAffixKeyForLevel,
  gearDefinitionForSlot,
  maxGearRoll,
  type GearItem,
  type GearLevel,
  type GearSlot,
} from "./gear"
import type { WeaponId } from "./types"

export type BisTableReading = {
  /** 표 위에 적힌 이름(예: "최대외공 빌드"). 못 읽으면 빈 문자열. */
  label: string
  /** 6줄 × 8칸. 0번 줄은 머리글. */
  cells: string[][]
}

export type BisImageReading = { tables: BisTableReading[]; headerText: string }

export type BisImportContext = {
  weapons: [WeaponId, WeaponId]
  /** 유파 태그(예: SilkbindWing). 방어구 정음 후보를 이 유파 것으로 좁혀요. */
  pathTag?: string
  /** 유파 속성(Bellstrike, Stonesplit, Silkbind, Bamboocut). "타유파"를 고를 때 써요. */
  attribute?: string
  level: GearLevel
}

export type BisDraftLine = { text: string; key?: string; guessed: boolean }
export type BisDraftSlot = { lines: BisDraftLine[]; attunement?: string; attunementGuessed: boolean }
export type BisDraft = { label: string; slots: Record<GearSlot, BisDraftSlot> }

/** 표의 칸 순서. 무기 두 칸은 머리글 이름을 보고 왼손·오른손을 정해요. */
export const bisTableSlotOrder: GearSlot[] = [
  "leftWeapon",
  "rightWeapon",
  "disc",
  "pendant",
  "helmet",
  "chestpiece",
  "greaves",
  "bracer",
]

const weaponShortNames: Record<string, string> = {
  hengBlade: "횡도",
  moBlade: "맥도",
  umbrella: "우산",
  unfetteredRopeDart: "승표",
  skygraspRopeDart: "승표",
  gauntlet: "권갑",
  spear: "창",
  sword: "검",
  fan: "부채",
  dualBlades: "쌍도",
  ribbonAndDrum: "북",
}
const weaponBoostKeys: Record<string, string> = {
  hengBlade: "hengBladeDmgBoost",
  moBlade: "moBladeDmgBoost",
  umbrella: "umbrellaDmgBoost",
  unfetteredRopeDart: "ropeDartDmgBoost",
  skygraspRopeDart: "ropeDartDmgBoost",
  gauntlet: "gauntletDmgBoost",
  spear: "spearDmgBoost",
  sword: "swordDmgBoost",
  fan: "fanDmgBoost",
  dualBlades: "dualBladesDmgBoost",
  ribbonAndDrum: "ribbonAndDrumDmgBoost",
}
const attributeWords: Record<string, string> = {
  Phys: "외공",
  VoidAttack: "무상",
  Bellstrike: "명금",
  Stonesplit: "열석",
  Silkbind: "견사",
  Bamboocut: "파죽",
}
const otherAttributes = ["Bellstrike", "Stonesplit", "Silkbind", "Bamboocut"]
const otherPathKey = "@otherPath"

type Alias = { alias: string; key: string }

function affixAliases(): Alias[] {
  const aliases: Alias[] = [
    { alias: "내공", key: "power" },
    { alias: "민첩", key: "agility" },
    { alias: "기세", key: "momentum" },
    { alias: "치명타", key: "crit" },
    { alias: "치명", key: "crit" },
    { alias: "정확도", key: "precision" },
    { alias: "정확", key: "precision" },
    { alias: "각성", key: "affinity" },
    { alias: "회심", key: "affinity" },
    { alias: "전무증", key: "allMartialArts" },
    { alias: "전체무술", key: "allMartialArts" },
    { alias: "보피증", key: "vsBossDmg" },
    { alias: "보스피해", key: "vsBossDmg" },
    { alias: "단비증", key: "singleTargetMysticDmgBoost" },
    { alias: "단일비결", key: "singleTargetMysticDmgBoost" },
    { alias: "광비증", key: "areaMysticDmgBoost" },
    { alias: "단체비결", key: "areaMysticDmgBoost" },
    { alias: "전비증", key: "allMysticDmgBoost" },
    { alias: "전체비결", key: "allMysticDmgBoost" },
    { alias: "최대타유파", key: `${otherPathKey}:max` },
    { alias: "최소타유파", key: `${otherPathKey}:min` },
    { alias: "취고", key: "ribbonAndDrumDmgBoost" },
    { alias: "비단북", key: "ribbonAndDrumDmgBoost" },
  ]
  for (const [suffix, word] of Object.entries(attributeWords)) {
    aliases.push({ alias: `최대${word}`, key: `max${suffix}` }, { alias: `최소${word}`, key: `min${suffix}` })
  }
  for (const [definitionId, short] of Object.entries(weaponShortNames)) {
    const key = weaponBoostKeys[definitionId]
    for (const tail of ["피증", "무증", "피해", "무술"]) aliases.push({ alias: `${short}${tail}`, key })
  }
  return aliases
}
const knownAffixAliases = affixAliases()

export function normalizeHangul(text: string) {
  return text.replace(/[^가-힣0-9]/g, "")
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row++) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= right.length; column++) {
      const above = previous[column]
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return previous[right.length]
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0
  return 1 - editDistance(left, right) / Math.max(left.length, right.length)
}

/** 칸 글자 하나를 조율 키로. 확실하지 않으면 key 없이 돌려줘요. */
export function matchAffixText(text: string): { key?: string; score: number } {
  const normalized = normalizeHangul(text)
  if (!normalized) return { score: 0 }
  let best: Alias | undefined
  let bestScore = 0
  for (const alias of knownAffixAliases) {
    const score = similarity(normalized, alias.alias)
    if (score > bestScore) {
      best = alias
      bestScore = score
    }
  }
  return bestScore >= 0.6 && best ? { key: best.key, score: bestScore } : { score: bestScore }
}

/** 머리글 칸에 적힌 무기 이름을 보고, 표의 첫 두 칸이 왼손·오른손 중 어디인지 정해요. */
export function weaponColumnsSwapped(headers: string[], weapons: [WeaponId, WeaponId]) {
  const [left, right] = weapons.map(weapon => {
    const slot = weapon === weapons[0] ? "leftWeapon" : "rightWeapon"
    return weaponShortNames[gearDefinitionForSlot(slot, weapons).definitionId] ?? ""
  })
  if (left === right) return false
  const first = normalizeHangul(headers[0] ?? "")
  const second = normalizeHangul(headers[1] ?? "")
  const firstIsRight = first !== "" && similarity(first, right) > similarity(first, left)
  const secondIsLeft = second !== "" && similarity(second, left) > similarity(second, right)
  return firstIsRight || secondIsLeft
}

const attunementTypeWords: Array<[RegExp, string]> = [
  [/Martial(?!.*Healing)/, "무술"],
  [/Special/, "특수"],
  [/Charged/, "차지"],
  [/Heavy/, "강공"],
  [/Light/, "약공"],
  [/VariedCombo/, "연계"],
  [/Bleeding/, "출혈"],
  [/Healing/, "치유"],
  [/Pursuit/, "추격"],
  [/Shield/, "보호막"],
  [/Deepdaze/, "만취"],
  [/Projectile/, "탄도"],
  [/Rodent/, "쥐"],
]

function attunementAliases(key: string, weapons: [WeaponId, WeaponId]): string[] {
  if (key === "physicalPenetration") return ["외공관통", "외관"]
  if (key === "formlessPenetration") return ["무상관통", "무관"]
  const definition = attunementData[key]
  if (!definition) return []
  const weaponWords = weapons.flatMap((weapon, index) => {
    const tagged = definition.tags.some(tag => tag.toLowerCase().startsWith(weapon.toLowerCase()))
    const slot = index === 0 ? "leftWeapon" : "rightWeapon"
    return tagged ? [weaponShortNames[gearDefinitionForSlot(slot, weapons).definitionId] ?? ""] : []
  })
  const types = attunementTypeWords.flatMap(([pattern, word]) => (pattern.test(key) ? [word] : []))
  const typeText = types.join("")
  return weaponWords.flatMap(word => [`${word}${typeText}스킬`, `${word}${typeText}피해`, `${word}${typeText}`])
}

/** 정음 후보 중 표 위 글자와 가장 비슷한 것. 비슷한 게 없으면 undefined. */
export function matchAttunementText(text: string, candidates: string[], weapons: [WeaponId, WeaponId]) {
  const normalized = normalizeHangul(text)
  let best: string | undefined
  let bestScore = 0
  for (const key of candidates) {
    for (const alias of attunementAliases(key, weapons)) {
      for (let length = Math.max(2, alias.length - 1); length <= alias.length + 1; length++) {
        for (let start = 0; start + length <= normalized.length; start++) {
          const score = similarity(normalized.slice(start, start + length), alias)
          if (score > bestScore) {
            best = key
            bestScore = score
          }
        }
      }
    }
  }
  return bestScore >= 0.7 ? best : undefined
}

function attunementCandidates(slot: GearSlot, context: BisImportContext) {
  const { definition } = gearDefinitionForSlot(slot, context.weapons)
  if (!definition) return []
  const all = attunementsForGearDefinition(definition)
  if (!definition.attunements.includes("Armor") || !context.pathTag) return all
  const ownPath = all.filter(key => attunementData[key]?.tags.includes(context.pathTag!))
  return ownPath.length ? ownPath : all
}

export function slotAffixOptions(slot: GearSlot, context: BisImportContext) {
  const { definition } = gearDefinitionForSlot(slot, context.weapons)
  if (!definition) return { base: [], additional: [] }
  return {
    base: affixOptionsForGearDefinition(definition, "baseAffixes", context.level),
    additional: affixOptionsForGearDefinition(definition, "additionalAffixes", context.level),
  }
}

export function slotAttunementOptions(slot: GearSlot, context: BisImportContext) {
  return attunementCandidates(slot, context)
}

function resolveAffixKey(key: string, slot: GearSlot, context: BisImportContext) {
  const options = slotAffixOptions(slot, context)
  const allowed = new Set([...options.base, ...options.additional])
  if (key.startsWith(otherPathKey)) {
    const bound = key.endsWith(":max") ? "max" : "min"
    const found = otherAttributes
      .filter(attribute => attribute !== context.attribute)
      .map(attribute => `${bound}${attribute}`)
      .find(candidate => allowed.has(candidate))
    return { key: found, guessed: true }
  }
  const leveled = gearAffixKeyForLevel(key, context.level)
  return allowed.has(leveled) ? { key: leveled, guessed: false } : { key: undefined, guessed: false }
}

export function interpretBisTable(table: BisTableReading, headerText: string, context: BisImportContext): BisDraft {
  const swapped = weaponColumnsSwapped(table.cells[0] ?? [], context.weapons)
  const weaponAttunement = matchAttunementText(headerText, attunementCandidates("leftWeapon", context), context.weapons)
  const armorAttunement = matchAttunementText(headerText, attunementCandidates("helmet", context), context.weapons)
  const slots = {} as Record<GearSlot, BisDraftSlot>
  bisTableSlotOrder.forEach((tableSlot, column) => {
    const slot: GearSlot =
      swapped && tableSlot === "leftWeapon"
        ? "rightWeapon"
        : swapped && tableSlot === "rightWeapon"
          ? "leftWeapon"
          : tableSlot
    const lines = Array.from({ length: 5 }, (_, row) => {
      const text = table.cells[row + 1]?.[column] ?? ""
      const matched = matchAffixText(text)
      if (!matched.key) return { text, guessed: false }
      const resolved = resolveAffixKey(matched.key, slot, context)
      return { text, key: resolved.key, guessed: resolved.guessed || matched.score < 0.85 }
    })
    const candidates = attunementCandidates(slot, context)
    const { definition } = gearDefinitionForSlot(slot, context.weapons)
    const read = definition?.attunements.includes("Armor") ? armorAttunement : weaponAttunement
    const attunement = read && candidates.includes(read) ? read : candidates[0]
    slots[slot] = { lines, attunement, attunementGuessed: attunement !== read }
  })
  return { label: table.label, slots }
}

export type BisDraftProblem = { slot: GearSlot; reason: "missing" | "base" | "duplicate" | "attunement" }

/** 확인 화면에서 고친 초안을 장비로. 문제가 있으면 장비 대신 문제 목록을 돌려줘요. */
export function gearItemsFromBisDraft(
  draft: BisDraft,
  context: BisImportContext,
  idForSlot: (slot: GearSlot) => string,
): { items: GearItem[]; equipped: Partial<Record<GearSlot, string>> } | { problems: BisDraftProblem[] } {
  const problems: BisDraftProblem[] = []
  const items: GearItem[] = []
  const equipped: Partial<Record<GearSlot, string>> = {}
  for (const slot of bisTableSlotOrder) {
    const draftSlot = draft.slots[slot]
    const keys = draftSlot.lines.map(line => line.key)
    if (keys.some(key => !key)) {
      problems.push({ slot, reason: "missing" })
      continue
    }
    const options = slotAffixOptions(slot, context)
    // 표의 첫 줄을 기본 조율로 쓰고, 첫 줄이 기본 조율이 될 수 없으면 될 수 있는 줄을 앞으로 옮겨요.
    const baseIndex = options.base.includes(keys[0]!) ? 0 : keys.findIndex(key => options.base.includes(key!))
    if (baseIndex < 0) {
      problems.push({ slot, reason: "base" })
      continue
    }
    const additionalKeys = keys.filter((_, index) => index !== baseIndex) as string[]
    if (
      new Set(additionalKeys).size !== additionalKeys.length ||
      additionalKeys.some(key => !options.additional.includes(key))
    ) {
      problems.push({ slot, reason: "duplicate" })
      continue
    }
    const attunement = draftSlot.attunement
    if (!attunement || !attunementCandidates(slot, context).includes(attunement)) {
      problems.push({ slot, reason: "attunement" })
      continue
    }
    const { definitionId, definition } = gearDefinitionForSlot(slot, context.weapons)
    const value = (key: string) => maxGearRoll(key, "affix", false, context.level) ?? 0
    items.push({
      id: idForSlot(slot),
      ...(definition?.weapon ? {} : { slot }),
      definitionId,
      level: context.level,
      rarity: "Gold",
      baseAffix: { key: keys[baseIndex]!, value: value(keys[baseIndex]!) },
      additionalAffixes: additionalKeys.map(key => ({ key, value: value(key) })),
      attunement: { key: attunement, value: maxGearRoll(attunement, "attunement", false, context.level) ?? 0 },
    })
    equipped[slot] = idForSlot(slot)
  }
  if (problems.length) return { problems }
  return { items, equipped }
}

const shortLabelOverrides: Record<string, string> = {
  crit: "치명타",
  precision: "정확도",
  affinity: "각성",
  allMartialArts: "전무증",
  vsBossDmg: "보피증",
  singleTargetMysticDmgBoost: "단비증",
  areaMysticDmgBoost: "광비증",
  allMysticDmgBoost: "전비증",
  ribbonAndDrumDmgBoost: "북피증",
}

/** 조율표에 쓰는 짧은 이름(최대외공, 보피증 등). 표에 없는 옵션은 undefined. */
export function affixShortLabel(key: string) {
  if (shortLabelOverrides[key]) return shortLabelOverrides[key]
  return knownAffixAliases.find(alias => alias.key === key)?.alias
}
