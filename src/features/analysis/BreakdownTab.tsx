import { Fragment, useState } from "react"

import type { PathId } from "@/application/contracts"
import { formatThroughput, formatNumber, skillDisplayName } from "@/application/formatting"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import {
  type RotationEffectCoverage,
  type RotationGroupBreakdown,
  type RotationHealingGroupBreakdown,
  type RotationHealingSkillBreakdown,
  type RotationMetrics,
  type RotationSkillBreakdown,
} from "@/calculations/rotationMetrics"
import type { SkillBreakdownGroup } from "@/calculations/skillBreakdownCategories"
import { gameText, t } from "@/i18n"
import { Panel, PanelHeading } from "@/ui/Panel"

function BreakdownGroupTable({
  title,
  rows,
  healingRows,
  colored = false,
}: {
  title: string
  rows: RotationGroupBreakdown[]
  healingRows?: RotationHealingGroupBreakdown[]
  colored?: boolean
}) {
  const hasHealing = (healingRows ?? []).some(row => row.healing > 0)
  return (
    <Panel className="breakdown-panel">
      <PanelHeading>
        <div>
          <h2>{title}</h2>
        </div>
      </PanelHeading>
      {hasHealing ? <h3 className="breakdown-channel-heading">{t("ui.app.damage")}</h3> : null}
      <div className="breakdown-table breakdown-group-table">
        <div className="breakdown-table-header">
          <span>{t("ui.app.category")}</span>
          <span>{t("ui.app.damage")}</span>
          <span>{t("ui.app.total")}</span>
        </div>
        {rows.map(row => (
          <div className="breakdown-table-row" key={row.id}>
            <span className={colored ? `damage-${row.id}` : ""}>{gameText(row.name)}</span>
            <strong>{formatThroughput(row.damage)}</strong>
            <strong>{formatNumber(row.percentage)}%</strong>
          </div>
        ))}
      </div>
      {hasHealing ? (
        <>
          <h3 className="breakdown-channel-heading healing-value">{t("ui.app.healing")}</h3>
          <div className="breakdown-table breakdown-group-table breakdown-healing-table">
            <div className="breakdown-table-header">
              <span>{t("ui.app.category")}</span>
              <span>{t("ui.app.healing")}</span>
              <span>{t("ui.app.total")}</span>
            </div>
            {(healingRows ?? [])
              .filter(row => row.healing > 0)
              .map(row => (
                <div className="breakdown-table-row" key={row.id}>
                  <span className={colored ? `healing-${row.id}` : ""}>{gameText(row.name)}</span>
                  <strong className="healing-value">+{formatThroughput(row.healing)}</strong>
                  <strong>{formatNumber(row.percentage)}%</strong>
                </div>
              ))}
          </div>
        </>
      ) : null}
    </Panel>
  )
}

function CastBreakdownComparison({
  value,
  valueWithBuff,
  stacked,
}: {
  value: number | undefined
  valueWithBuff: number | undefined
  stacked: boolean
}) {
  if (valueWithBuff === undefined) return value === undefined ? "—" : formatThroughput(value)
  if (!stacked) return `${formatThroughput(value ?? 0)} (${formatThroughput(valueWithBuff)})`
  return (
    <span className="breakdown-stacked-value">
      <span>{formatThroughput(value ?? 0)}</span>
      <span>({formatThroughput(valueWithBuff)})</span>
    </span>
  )
}

const stackedBuffAttributionTags = new Set(["FluteOfTheTides", "GhostlySteps"])

function EffectCoveragePanel({
  title,
  rows,
  showMaxStackCoverage = false,
}: {
  title: string
  rows: RotationEffectCoverage[]
  showMaxStackCoverage?: boolean
}) {
  return (
    <Panel className="breakdown-panel">
      <PanelHeading>
        <div>
          <h2>{title}</h2>
        </div>
      </PanelHeading>
      <div className={`breakdown-table breakdown-coverage-table${showMaxStackCoverage ? " with-time-coverage" : ""}`}>
        <div className="breakdown-table-header">
          <span>{t("ui.app.effect")}</span>
          <span>{t("ui.app.averageStack")}</span>
          {showMaxStackCoverage ? <span>{t("ui.app.maxStackCoverage")}</span> : null}
        </div>
        {rows.map(row => (
          <div className="breakdown-table-row" key={row.id}>
            <span>{gameText(effectDefinitions[row.id]?.name ?? row.id)}</span>
            <strong>{formatNumber(row.averageStacks)}</strong>
            {showMaxStackCoverage ? (
              <strong>{row.maxStackCoverage === undefined ? "—" : `${formatNumber(row.maxStackCoverage)}%`}</strong>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function SkillBreakdownRows({
  row,
}: {
  row: SkillBreakdownGroup<RotationSkillBreakdown | RotationHealingSkillBreakdown>
}) {
  const [expanded, setExpanded] = useState(false)
  const label = row.children ? gameText(row.name) : skillDisplayName(allSkillDefinitions[row.id], row.name, row.id)
  const toggle = row.children ? (
    <button
      type="button"
      className="breakdown-category-toggle"
      aria-label={label}
      aria-expanded={expanded}
      onClick={() => setExpanded(value => !value)}
    >
      <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
    </button>
  ) : null
  return (
    <Fragment>
      {"damage" in row ? (
        <div className="breakdown-table-row">
          <span className="breakdown-toggle-cell">{toggle}</span>
          <span className="breakdown-skill-name">{label}</span>
          <strong>{row.casts || ""}</strong>
          <strong>{row.triggers ? formatNumber(row.triggers) : ""}</strong>
          <strong>{row.hits ? formatNumber(row.hits) : ""}</strong>
          <strong>{formatNumber(row.abrasionRate)}%</strong>
          <strong>{formatNumber(row.normalRate)}%</strong>
          <strong>{formatNumber(row.criticalRate)}%</strong>
          <strong>{formatNumber(row.affinityRate)}%</strong>
          <strong>{formatThroughput(row.damage)}</strong>
          <strong>{formatNumber(row.percentage)}%</strong>
        </div>
      ) : (
        <div className="breakdown-table-row">
          <span className="breakdown-toggle-cell">{toggle}</span>
          <span className="breakdown-skill-name">{label}</span>
          <strong>{row.casts || ""}</strong>
          <strong>{row.triggers || ""}</strong>
          <strong>{row.heals || ""}</strong>
          <strong>{formatNumber(row.normalRate)}%</strong>
          <strong>{formatNumber(row.criticalRate)}%</strong>
          <strong className="healing-value">+{formatThroughput(row.healing)}</strong>
          <strong>{formatNumber(row.percentage)}%</strong>
        </div>
      )}
      {expanded && row.children ? (
        <div className="breakdown-category-children">
          {row.children.map(child => (
            <SkillBreakdownRows key={child.id} row={child} />
          ))}
        </div>
      ) : null}
    </Fragment>
  )
}

export function BreakdownTab({ metrics, pathId }: { metrics?: RotationMetrics; pathId: PathId }) {
  if (!metrics)
    return (
      <Panel className="breakdown-empty">
        <h2>{t("ui.app.dpsBreakdown", { dps: t("system.dps") })}</h2>
        <p>{t("ui.app.recalculating")}</p>
      </Panel>
    )
  const { breakdown } = metrics
  const hasHealing = metrics.totalHealing > 0
  const showDamagePerVitality = pathId === "silkbindDeluge"
  const castRows = showDamagePerVitality
    ? [...breakdown.casts].sort((left, right) => {
        const leftPerVitality = left.damagePerVitalityWithBuff ?? left.damagePerVitality ?? Number.NEGATIVE_INFINITY
        const rightPerVitality = right.damagePerVitalityWithBuff ?? right.damagePerVitality ?? Number.NEGATIVE_INFINITY
        return (
          rightPerVitality - leftPerVitality ||
          (right.averageDpsWithBuff ?? right.averageDps ?? Number.NEGATIVE_INFINITY) -
            (left.averageDpsWithBuff ?? left.averageDps ?? Number.NEGATIVE_INFINITY)
        )
      })
    : breakdown.casts
  return (
    <div className="breakdown-page">
      <Panel className="breakdown-panel breakdown-skill-panel">
        <PanelHeading>
          <div>
            <h2>{t("ui.app.perSkillBreakdown")}</h2>
          </div>
          <div className="breakdown-totals">
            <span>
              {t("system.totalDamage")} <strong>{formatThroughput(metrics.totalDamage)}</strong>
            </span>
            <span>
              {t("system.dps")} <strong>{formatThroughput(metrics.dps)}</strong>
            </span>
            {hasHealing ? (
              <>
                <span>
                  {t("system.totalHealing")}{" "}
                  <strong className="healing-value">+{formatThroughput(metrics.totalHealing)}</strong>
                </span>
                <span>
                  {t("system.hps")} <strong className="healing-value">{formatThroughput(metrics.hps)}</strong>
                </span>
              </>
            ) : null}
          </div>
        </PanelHeading>
        {hasHealing ? <h3 className="breakdown-channel-heading">{t("ui.app.damage")}</h3> : null}
        <div className="breakdown-table breakdown-skill-table">
          <div className="breakdown-table-header">
            <span aria-hidden="true" />
            <span>{t("ui.app.skill")}</span>
            <span>{t("ui.app.casts")}</span>
            <span>{t("ui.app.triggers")}</span>
            <span>{t("ui.app.hits")}</span>
            <span>{t("system.abrasion")}</span>
            <span>{t("system.normal")}</span>
            <span>{t("system.critical")}</span>
            <span>{t("system.affinity")}</span>
            <span>{t("ui.app.damage")}</span>
            <span>{t("ui.app.total")}</span>
          </div>
          {breakdown.groupedSkills.map(row => (
            <SkillBreakdownRows key={row.id} row={row} />
          ))}
        </div>
        {hasHealing ? (
          <>
            <h3 className="breakdown-channel-heading healing-value">{t("ui.app.healing")}</h3>
            <div className="breakdown-table breakdown-healing-skill-table breakdown-healing-table">
              <div className="breakdown-table-header">
                <span aria-hidden="true" />
                <span>{t("ui.app.skill")}</span>
                <span>{t("ui.app.casts")}</span>
                <span>{t("ui.app.triggers")}</span>
                <span>{t("ui.app.heals")}</span>
                <span>{t("system.normal")}</span>
                <span>{t("system.critical")}</span>
                <span>{t("ui.app.healing")}</span>
                <span>{t("ui.app.total")}</span>
              </div>
              {breakdown.groupedHealingSkills.map(row => (
                <SkillBreakdownRows key={row.id} row={row} />
              ))}
            </div>
          </>
        ) : null}
      </Panel>
      <Panel className="breakdown-panel">
        <PanelHeading>
          <div>
            <h2>{t("ui.app.perCastBreakdown")}</h2>
          </div>
        </PanelHeading>
        {hasHealing ? <h3 className="breakdown-channel-heading">{t("ui.app.damage")}</h3> : null}
        <div className={`breakdown-table breakdown-cast-table${showDamagePerVitality ? " with-vitality" : ""}`}>
          <div className="breakdown-table-header breakdown-cast-table-header">
            <span>{t("ui.app.skill")}</span>
            <span>{t("ui.app.casts")}</span>
            <span>{t("ui.app.avgCastTime")}</span>
            <span className={`breakdown-damage-header${showDamagePerVitality ? " with-vitality" : ""}`}>
              <span>{t("ui.app.damage")}</span>
              {showDamagePerVitality ? <span>{t("ui.app.perVit")}</span> : null}
              <span>{t("system.dps")}</span>
              <span>{t("ui.app.perCast")}</span>
              <span>{t("ui.app.total")}</span>
            </span>
            <span>{t("ui.app.percentage")}</span>
          </div>
          {castRows.map(row => {
            const stackBuffComparison =
              allSkillDefinitions[row.skillId]?.tags?.some(tag => stackedBuffAttributionTags.has(tag)) ?? false
            return (
              <div className="breakdown-table-row" key={row.id}>
                <span>{skillDisplayName(allSkillDefinitions[row.skillId], row.name, row.skillId)}</span>
                <strong>{row.casts}</strong>
                <strong>
                  {formatNumber(row.averageCastTime)}
                  {t("ui.app.s")}
                </strong>
                {showDamagePerVitality ? (
                  <strong>
                    <CastBreakdownComparison
                      value={row.damagePerVitality}
                      valueWithBuff={row.damagePerVitalityWithBuff}
                      stacked={stackBuffComparison}
                    />
                  </strong>
                ) : null}
                <strong>
                  <CastBreakdownComparison
                    value={row.averageDps}
                    valueWithBuff={row.averageDpsWithBuff}
                    stacked={stackBuffComparison}
                  />
                </strong>
                <strong>
                  <CastBreakdownComparison
                    value={row.averageDamage}
                    valueWithBuff={row.averageDamageWithBuff}
                    stacked={stackBuffComparison}
                  />
                </strong>
                <strong>
                  <CastBreakdownComparison
                    value={row.damage}
                    valueWithBuff={row.damageWithBuff}
                    stacked={stackBuffComparison}
                  />
                </strong>
                <strong>{formatNumber(row.percentage)}%</strong>
              </div>
            )
          })}
        </div>
        {hasHealing ? (
          <>
            <h3 className="breakdown-channel-heading healing-value">{t("ui.app.healing")}</h3>
            <div className="breakdown-table breakdown-healing-cast-table breakdown-healing-table">
              <div className="breakdown-table-header">
                <span>{t("ui.app.skill")}</span>
                <span>{t("ui.app.casts")}</span>
                <span>{t("ui.app.avgCastTime")}</span>
                <span>{t("ui.app.averageHps")}</span>
                <span>{t("ui.app.perCast")}</span>
                <span>{t("ui.app.total")}</span>
                <span>{t("ui.app.percentage")}</span>
              </div>
              {breakdown.healingCasts.map(row => (
                <div className="breakdown-table-row" key={row.id}>
                  <span>{skillDisplayName(allSkillDefinitions[row.skillId], row.name, row.skillId)}</span>
                  <strong>{row.casts}</strong>
                  <strong>
                    {formatNumber(row.averageCastTime)}
                    {t("ui.app.s")}
                  </strong>
                  <strong className="healing-value">
                    {row.averageHps === undefined ? "—" : formatThroughput(row.averageHps)}
                  </strong>
                  <strong className="healing-value">+{formatThroughput(row.averageHealing)}</strong>
                  <strong className="healing-value">+{formatThroughput(row.healing)}</strong>
                  <strong>{formatNumber(row.percentage)}%</strong>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Panel>
      <div className="breakdown-coverage-grid">
        <EffectCoveragePanel title={t("ui.app.buffCoverage")} rows={breakdown.buffCoverage} />
        <EffectCoveragePanel title={t("ui.app.debuffCoverage")} rows={breakdown.debuffCoverage} showMaxStackCoverage />
      </div>
      <BreakdownGroupTable
        title={t("ui.app.skillTypeBreakdown")}
        rows={breakdown.categories}
        healingRows={breakdown.healingCategories}
      />
      <BreakdownGroupTable
        title={t("ui.app.physicalAndAttributeBreakdown")}
        rows={breakdown.damageTypes}
        healingRows={breakdown.healingTypes}
        colored
      />
    </div>
  )
}
