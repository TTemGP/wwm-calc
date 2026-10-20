import { useState } from "react"

import { resolveBuildStatState } from "@/application/buildStatState"
import { formatNumber, formatThroughput, formatThroughputDelta, throughputDeltaClass } from "@/application/formatting"
import { breakthroughProfile } from "@/application/gameData/setup"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { innerWayDefinitions } from "@/data/innerWayDefinitions"
import { allStatDefinitions } from "@/data/statDefinitions"
import {
  attunementData,
  buildEntryAvailableForMartialArts,
  gearData,
  gearSlots,
  gearItemSupportsSlot,
  resolveBuildInventory,
  type BuildEntry,
  type GearInventory,
  type GearItem,
  type GearSlot,
  type GearValue,
} from "@/gear"
import { dataText, gameText, t } from "@/i18n"
import type { WeaponId } from "@/types"
import { Button } from "@/ui/Button"
import { Checkbox } from "@/ui/Checkbox"
import { Select } from "@/ui/Select"

import { useBuildThroughputs } from "./useBuildThroughputs"

type Row = {
  key: string
  label: string
  /** One line per entry, so a gear slot can list its affixes under its name. */
  own: string[]
  other: string[]
  /** Signed difference (other − own) for numeric rows; text rows only mark whether they differ. */
  delta?: number
  deltaText?: string
  differs: boolean
  channel?: "damage" | "healing"
}

type Section = { key: string; title: string; rows: Row[] }

type ValueDefinition = { name?: string; percentage?: boolean }

function buildDisplayName(entry: Pick<BuildEntry, "name" | "isDefault">) {
  return (entry.isDefault ? gameText(entry.name) : entry.name) || "Unnamed Build"
}

export function innerWayLabel(id: string) {
  const definition = innerWayDefinitions[id as keyof typeof innerWayDefinitions]
  if (!definition) return id
  return dataText(`system.innerWay.${id.charAt(0).toLowerCase()}${id.slice(1)}`, definition.name)
}

function valueText(value: number, definition?: ValueDefinition) {
  return `${formatNumber(definition?.percentage ? value * 100 : value)}${definition?.percentage ? "%" : ""}`
}

function affixLine(affix: GearValue, definition?: ValueDefinition) {
  return `${gameText(definition?.name ?? affix.key)} ${valueText(affix.value, definition)}`
}

function equippedItem(inventory: GearInventory, slot: GearSlot) {
  const id = inventory.equipped[slot]
  return inventory.items.find(candidate => candidate.id === id && gearItemSupportsSlot(candidate, slot))
}

/** 장비 이름 아래에 기본 옵션, 추가 옵션, 조율을 한 줄씩 적어요. */
function itemLines(item: GearItem | undefined) {
  if (!item) return [t("ui.buildTab.compareEmptySlot")]
  const name = gameText(gearData.gear[item.definitionId]?.name) || item.definitionId
  const attunement = item.attunement
    ? affixLine(item.attunement, attunementData[item.attunement.key])
    : t("ui.app.none")
  return [
    item.relayed ? `${name} · ${t("ui.buildTab.compareRelayed")}` : name,
    affixLine(item.baseAffix, gearData.affixes[item.baseAffix.key]),
    ...item.additionalAffixes.map(affix => affixLine(affix, gearData.affixes[affix.key])),
    `${t("ui.buildTab.compareAttunement")}: ${attunement}`,
  ]
}

/**
 * 신력: 무기·무술·비결·보스 피해 증가처럼 피해를 직접 올리는 옵션이에요. BiS 조율표에서
 * "필수 신력 N개"로 세는 줄이에요.
 */
const divinePowerAffixes = new Set([
  "allMartialArts",
  "vsBossDmg",
  "allMysticDmgBoost",
  "singleTargetMysticDmgBoost",
  "areaMysticDmgBoost",
])

export function isDivinePowerAffix(key: string) {
  return divinePowerAffixes.has(key) || key.endsWith("DmgBoost")
}

/**
 * 장비 전체의 옵션·조율을 종류별로 세요. 옵션은 부위끼리 자리를 바꿔 달 수 있으니 어느 부위에
 * 있는지가 아니라 몇 줄인지로 비교해요.
 */
function countsFor(items: readonly (GearItem | undefined)[]) {
  const affixes = new Map<string, { count: number; total: number }>()
  const attunements = new Map<string, { count: number; total: number }>()
  const add = (map: typeof affixes, value: GearValue) => {
    const current = map.get(value.key) ?? { count: 0, total: 0 }
    map.set(value.key, { count: current.count + 1, total: current.total + value.value })
  }
  for (const item of items) {
    if (!item) continue
    for (const affix of [item.baseAffix, ...item.additionalAffixes]) add(affixes, affix)
    if (item.attunement) add(attunements, item.attunement)
  }
  return { affixes, attunements }
}

/** "T6" 같은 심법 단계를 공식 표기 "6중"으로 읽어요. */
export function innerWayTierText(tier: string) {
  const number = /^T(\d+)$/.exec(tier)?.[1]
  return number === undefined ? tier : t("ui.app.innerWayTierLabel", { number })
}

function itemContent(item: GearItem | undefined) {
  if (!item) return ""
  const { id: _id, ...rest } = item
  return JSON.stringify(rest)
}

/**
 * 연운 딜 계산기: 보고 있는 빌드(내 현재 장비)를 BiS(졸업 프리셋)나 다른 빌드와 나란히 놓고 비교해요.
 *
 * 기본 비교 대상은 이 유파의 BiS 중 DPS가 가장 높은 것이에요. 부위별로 장비 옵션과 조율을
 * 나란히 보여 주고, 옵션·조율 합계와 능력치, 딜량 차이도 함께 보여 줘요. 두 빌드 모두 지금
 * 캐릭터 정보와 사용 중인 로테이션으로 계산하므로 장비를 바꾸면 차이가 바로 바뀌어요.
 */
export function BuildComparison({
  viewed,
  entries,
  graduatedBuildIds,
  gearItems,
  weapons,
  measurement,
  rotation,
  onOpen,
  locked = false,
}: {
  viewed: BuildEntry
  entries: BuildEntry[]
  /** 이 유파의 BiS(졸업) 프리셋. */
  graduatedBuildIds: string[]
  gearItems: GearItem[]
  weapons: [WeaponId, WeaponId]
  measurement: MeasurementContext
  rotation: RotationRecord | undefined
  onOpen: (entry: BuildEntry) => void
  /** 장비 검색 중에는 다른 화면처럼 고르는 칸을 잠가요. */
  locked?: boolean
}) {
  const candidates = entries.filter(
    entry => entry.id !== viewed.id && buildEntryAvailableForMartialArts(entry, weapons),
  )
  const bisCandidates = candidates.filter(entry => graduatedBuildIds.includes(entry.id))
  const otherCandidates = candidates.filter(entry => !graduatedBuildIds.includes(entry.id))
  const [chosenId, setChosenId] = useState<string | undefined>()
  const [onlyDifferences, setOnlyDifferences] = useState(false)

  // BiS 후보는 모두 재서 DPS가 가장 높은 것을 기본 비교 대상으로 삼아요.
  const bisReadings = useBuildThroughputs({
    targets: bisCandidates.map(entry => ({ key: entry.id, build: entry })),
    gearItems,
    context: measurement,
    rotation,
  })
  let bestBis: BuildEntry | undefined
  for (const entry of bisCandidates) {
    const dps = bisReadings[entry.id]?.dps
    const bestDps = bestBis ? bisReadings[bestBis.id]?.dps : undefined
    if (!bestBis || (dps !== undefined && (bestDps === undefined || dps > bestDps))) bestBis = entry
  }
  const other = candidates.find(entry => entry.id === chosenId) ?? bestBis ?? candidates[0]
  const otherIsBis = other !== undefined && graduatedBuildIds.includes(other.id)

  const readings = useBuildThroughputs({
    targets: [
      { key: "own", build: viewed },
      { key: "other", build: other },
    ],
    gearItems,
    context: measurement,
    rotation,
  })

  const sections = compareSections()

  function compareSections(): Section[] {
    if (!other) return []
    const { environment, statOverrides, attunementOverrides, buildSetupOverrides } = measurement
    const gearTier = breakthroughProfile(environment.settings).gearTier
    const stateFor = (build: BuildEntry) =>
      resolveBuildStatState({
        build,
        gearItems,
        pathId: environment.pathId,
        settings: environment.settings,
        setupSelections: environment.setupSelections,
        statOverrides,
        attunementOverrides,
        buildSetupOverrides:
          buildSetupOverrides && buildSetupOverrides.buildId === build.id ? buildSetupOverrides.overrides : undefined,
      })
    const own = stateFor(viewed)
    const theirs = stateFor(other)

    const numberRow = (key: string, label: string, a: number, b: number, unit = ""): Row => {
      const delta = b - a
      return {
        key,
        label,
        own: [`${formatNumber(a)}${unit}`],
        other: [`${formatNumber(b)}${unit}`],
        delta,
        deltaText: Math.abs(delta) < 1e-9 ? "0" : `${delta > 0 ? "+" : ""}${formatNumber(delta)}${unit}`,
        differs: Math.abs(delta) >= 0.005,
      }
    }

    const ownReading = readings.own
    const otherReading = readings.other
    const output: Row[] = []
    const throughputRow = (
      key: string,
      label: string,
      a?: number,
      b?: number,
      channel: "damage" | "healing" = "damage",
    ) => {
      const delta = a !== undefined && b !== undefined ? b - a : undefined
      const percent = delta !== undefined && a ? (delta / a) * 100 : undefined
      const percentText = percent === undefined ? "" : ` (${percent > 0 ? "+" : ""}${formatNumber(percent)}%)`
      output.push({
        key,
        label,
        own: [a === undefined ? "…" : formatThroughput(a, 0)],
        other: [b === undefined ? "…" : formatThroughput(b, 0)],
        delta,
        deltaText: delta === undefined ? "…" : `${formatThroughputDelta(delta, 0)}${percentText}`,
        differs: delta === undefined || Math.round(delta) !== 0,
        channel,
      })
    }
    throughputRow("dps", t("system.dps"), ownReading?.dps, otherReading?.dps)
    if ((ownReading?.hps ?? 0) > 0 || (otherReading?.hps ?? 0) > 0)
      throughputRow("hps", t("system.hps"), ownReading?.hps, otherReading?.hps, "healing")
    throughputRow("totalDamage", t("system.totalDamage"), ownReading?.totalDamage, otherReading?.totalDamage)
    if (ownReading && otherReading && otherReading.dps > 0)
      output.push({
        key: "reach",
        label: t("ui.buildTab.compareReach"),
        own: [`${formatNumber((ownReading.dps / otherReading.dps) * 100)}%`],
        other: ["100%"],
        differs: true,
      })

    const ownInventory = resolveBuildInventory(viewed, gearItems, environment.settings.weapons, gearTier)
    const otherInventory = resolveBuildInventory(other, gearItems, environment.settings.weapons, gearTier)
    const ownItems = gearSlots.map(slot => equippedItem(ownInventory, slot))
    const otherItems = gearSlots.map(slot => equippedItem(otherInventory, slot))

    const ownCounts = countsFor(ownItems)
    const otherCounts = countsFor(otherItems)
    const countRow = (key: string, label: string, a: number, b: number, detail?: [string, string]): Row => {
      const delta = b - a
      const piece = t("ui.buildTab.comparePieces")
      return {
        key,
        label,
        own: [`×${a}${piece}`, ...(detail?.[0] ? [detail[0]] : [])],
        other: [`×${b}${piece}`, ...(detail?.[1] ? [detail[1]] : [])],
        delta,
        deltaText: delta === 0 ? "0" : `${delta > 0 ? "+" : ""}${delta}${piece}`,
        differs: delta !== 0,
      }
    }
    const countRows = (
      kind: "affix" | "attunement",
      a: Map<string, { count: number; total: number }>,
      b: Map<string, { count: number; total: number }>,
      definitionFor: (key: string) => ValueDefinition | undefined,
    ) =>
      [...new Set([...a.keys(), ...b.keys()])]
        .map(key => ({ key, mine: a.get(key) ?? { count: 0, total: 0 }, theirs: b.get(key) ?? { count: 0, total: 0 } }))
        // BiS 조율표처럼 비교 빌드에 많은 옵션부터 보여 줘요.
        .sort((left, right) => right.theirs.count - left.theirs.count || right.mine.count - left.mine.count)
        .map(({ key, mine, theirs }) => {
          const definition = definitionFor(key)
          const label = gameText(definition?.name ?? key)
          return countRow(
            `${kind}-${key}`,
            kind === "attunement" ? `${t("ui.buildTab.compareAttunement")}: ${label}` : label,
            mine.count,
            theirs.count,
            [
              mine.count ? `${t("ui.buildTab.compareSum")} ${valueText(mine.total, definition)}` : "",
              theirs.count ? `${t("ui.buildTab.compareSum")} ${valueText(theirs.total, definition)}` : "",
            ],
          )
        })
    const divinePower = (counts: typeof ownCounts) =>
      [...counts.affixes].filter(([key]) => isDivinePowerAffix(key)).reduce((sum, [, entry]) => sum + entry.count, 0)
    const counts: Row[] = [
      countRow("divinePower", t("ui.buildTab.compareDivinePower"), divinePower(ownCounts), divinePower(otherCounts)),
      ...countRows("affix", ownCounts.affixes, otherCounts.affixes, key => gearData.affixes[key]),
      ...countRows("attunement", ownCounts.attunements, otherCounts.attunements, key => attunementData[key]),
    ]

    const gear: Row[] = gearSlots.map((slot, index) => ({
      key: slot,
      label: dataText(`system.gearSlot.${slot}`, gearData.slots[slot]),
      own: itemLines(ownItems[index]),
      other: itemLines(otherItems[index]),
      // 같은 옵션의 장비가 따로 저장돼 있어도 같은 장비로 봐요.
      differs: itemContent(ownItems[index]) !== itemContent(otherItems[index]),
    }))

    const rateRow = (key: "effectivePrecision" | "finalCrit" | "finalAffinity", label: string) =>
      numberRow(key, label, own.derivedStats[key] * 100, theirs.derivedStats[key] * 100, "%")
    const stats: Row[] = [
      rateRow("effectivePrecision", t("ui.app.effectivePrecision")),
      rateRow("finalCrit", t("ui.app.finalCritical")),
      rateRow("finalAffinity", t("ui.app.finalAffinity")),
      ...allStatDefinitions
        .filter(definition => own.stats[definition.key] !== 0 || theirs.stats[definition.key] !== 0)
        .map(definition => {
          const scale = definition.unit === "%" ? 100 : 1
          return numberRow(
            definition.key,
            gameText(definition.label),
            own.stats[definition.key] * scale,
            theirs.stats[definition.key] * scale,
            definition.unit === "%" ? "%" : "",
          )
        }),
    ]

    // 심법은 칸 순서와 상관없이 종류와 단계(N중)만 비교해요.
    const innerWayMap = (rows: { innerWay: string; tier: string }[]) =>
      new Map(rows.filter(row => row.innerWay).map(row => [row.innerWay, row.tier]))
    const ownInnerWays = innerWayMap(own.buildSetup.innerWays)
    const otherInnerWays = innerWayMap(theirs.buildSetup.innerWays)
    const innerWays: Row[] = [...new Set([...ownInnerWays.keys(), ...otherInnerWays.keys()])].map(id => {
      const a = ownInnerWays.get(id)
      const b = otherInnerWays.get(id)
      return {
        key: `innerWay-${id}`,
        label: innerWayLabel(id),
        own: [a === undefined ? t("ui.app.none") : innerWayTierText(a)],
        other: [b === undefined ? t("ui.app.none") : innerWayTierText(b)],
        differs: a !== b,
      }
    })

    return [
      { key: "output", title: t("ui.buildTab.compareSectionOutput"), rows: output },
      { key: "counts", title: t("ui.buildTab.compareSectionCounts"), rows: counts },
      { key: "gear", title: t("ui.buildTab.compareSectionGear"), rows: gear },
      { key: "stats", title: t("ui.buildTab.compareSectionStats"), rows: stats },
      { key: "innerWays", title: t("ui.buildTab.compareSectionInnerWays"), rows: innerWays },
    ]
  }

  const otherHeading = other ? `${otherIsBis ? "BiS · " : ""}${buildDisplayName(other)}` : ""

  return (
    <details className="build-compare" open>
      <summary className="build-compare-summary">{t("ui.buildTab.compareTitle")}</summary>
      {!other ? (
        <p className="build-compare-empty">{t("ui.buildTab.compareEmpty")}</p>
      ) : (
        <>
          <div className="build-compare-controls">
            <label className="build-compare-picker">
              <span>{t("ui.buildTab.compareWith")}</span>
              <Select disabled={locked} value={other.id} onChange={event => setChosenId(event.target.value)}>
                {bisCandidates.length > 0 ? (
                  <optgroup label={t("ui.buildTab.compareBisGroup")}>
                    {bisCandidates.map(entry => (
                      <option key={entry.id} value={entry.id}>
                        {buildDisplayName(entry)}
                        {entry.id === bestBis?.id && bisCandidates.length > 1
                          ? ` (${t("ui.buildTab.compareBest")})`
                          : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {otherCandidates.length > 0 ? (
                  <optgroup label={t("ui.buildTab.compareOtherGroup")}>
                    {otherCandidates.map(entry => (
                      <option key={entry.id} value={entry.id}>
                        {buildDisplayName(entry)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            </label>
            <Button variant="secondary" size="small" type="button" disabled={locked} onClick={() => onOpen(other)}>
              {t("ui.buildTab.compareOpen")}
            </Button>
            <label className="build-compare-toggle">
              <Checkbox
                disabled={locked}
                checked={onlyDifferences}
                onChange={event => setOnlyDifferences(event.target.checked)}
              />
              <span>{t("ui.buildTab.compareOnlyDifferences")}</span>
            </label>
          </div>
          <p className="build-compare-hint">{t("ui.buildTab.compareHint")}</p>
          <div className="build-compare-table-wrap">
            <table className="build-compare-table">
              <thead>
                <tr>
                  <th scope="col">{t("ui.buildTab.compareItem")}</th>
                  <th scope="col">{buildDisplayName(viewed)}</th>
                  <th scope="col">{otherHeading}</th>
                  <th scope="col">{t("ui.buildTab.compareDifference")}</th>
                </tr>
              </thead>
              {sections.map(section => {
                const rows =
                  onlyDifferences && section.key !== "output" ? section.rows.filter(row => row.differs) : section.rows
                if (rows.length === 0) return null
                return (
                  <tbody key={section.key} className={`build-compare-${section.key}`}>
                    <tr className="build-compare-section">
                      <th scope="colgroup" colSpan={4}>
                        {section.title}
                      </th>
                    </tr>
                    {rows.map(row => (
                      <tr key={row.key} className={row.differs ? "build-compare-differs" : undefined}>
                        <th scope="row">{row.label}</th>
                        <td>
                          {row.own.map((line, index) => (
                            <span
                              key={`${index}-${line}`}
                              className={
                                section.key === "gear" && !row.other.includes(line)
                                  ? "build-compare-line build-compare-line-changed"
                                  : "build-compare-line"
                              }
                            >
                              {line}
                            </span>
                          ))}
                        </td>
                        <td>
                          {row.other.map((line, index) => (
                            <span
                              key={`${index}-${line}`}
                              className={
                                section.key === "gear" && !row.own.includes(line)
                                  ? "build-compare-line build-compare-line-changed"
                                  : "build-compare-line"
                              }
                            >
                              {line}
                            </span>
                          ))}
                        </td>
                        <td
                          className={
                            row.delta === undefined
                              ? undefined
                              : throughputDeltaClass(row.delta, row.channel ?? "damage")
                          }
                        >
                          {row.deltaText ??
                            (row.key === "reach" ? "" : row.differs ? t("ui.buildTab.compareChanged") : "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )
              })}
            </table>
          </div>
        </>
      )}
    </details>
  )
}
