import { IconArrowUp } from "@tabler/icons-react"
import { useMemo, useState } from "react"

import { deltaPrefix, formatNumber, formatThroughputDelta, throughputDeltaClass } from "@/application/formatting"
import type { RotationCalculationCategory, RotationPriority } from "@/calculations/rotationMetrics"
import { gameText, t } from "@/i18n"
import { nextStatPriorityMode, statPriorityDisplayRows, type StatPriorityMode } from "@/statPriorityDisplay"
import { Button } from "@/ui/Button"
import { Panel, PanelHeading } from "@/ui/Panel"

import { CalculationStatus } from "./CalculationStatus"

export const emptyPriorityRows: RotationPriority[] = []

export function PriorityPanel({
  title,
  rows,
  calculationCategory,
  sectionBreakAt,
  showMaxRoll = false,
  showHealing = false,
}: {
  title: string
  rows: RotationPriority[]
  calculationCategory: RotationCalculationCategory
  sectionBreakAt?: number
  showMaxRoll?: boolean
  showHealing?: boolean
}) {
  const [statMode, setStatMode] = useState<StatPriorityMode>("max")
  const isStatPriority = calculationCategory === "statPriority"
  const displayedRows = useMemo(
    () => statPriorityDisplayRows(rows, isStatPriority ? statMode : "max"),
    [rows, isStatPriority, statMode],
  )
  const modeLabels = {
    max: t("ui.app.priorityModeMax"),
    relayed: t("ui.buildTab.relayedOptionLabel"),
    both: t("ui.app.priorityModeBoth"),
  }
  return (
    <Panel className="priority-panel">
      <PanelHeading>
        <div>
          <h2>{title}</h2>
          <CalculationStatus category={calculationCategory} />
        </div>
        {isStatPriority && (
          <Button
            type="button"
            className="priority-mode-control"
            variant="secondary"
            onClick={() => setStatMode(nextStatPriorityMode)}
            aria-label={t("ui.app.priorityModeSwitch", {
              current: modeLabels[statMode],
              next: modeLabels[nextStatPriorityMode(statMode)],
            })}
          >
            {modeLabels[statMode]}
          </Button>
        )}
      </PanelHeading>
      {rows.length > 0 ? (
        <div
          className={`priority-list ${showMaxRoll ? "priority-list-with-roll" : ""} ${showHealing ? "priority-list-with-healing" : ""}`}
        >
          <div className="priority-header">
            <span>{t("ui.app.name")}</span>
            {showMaxRoll && (
              <span>{isStatPriority && statMode !== "max" ? t("ui.app.priorityRoll") : t("ui.app.maxRoll")}</span>
            )}
            <span>{t("ui.app.throughputDeltaHeader", { throughput: t("system.dps") })}</span>
            <span>{t("ui.app.throughputPercentageHeader", { throughput: t("system.dps") })}</span>
            {showHealing ? (
              <>
                <span className="healing-value">
                  {t("ui.app.throughputDeltaHeader", { throughput: t("system.hps") })}
                </span>
                <span className="healing-value">
                  {t("ui.app.throughputPercentageHeader", { throughput: t("system.hps") })}
                </span>
              </>
            ) : null}
          </div>
          {displayedRows.map((row, index) => (
            <div
              className={`priority-row ${sectionBreakAt === index ? "priority-section-start" : ""}`}
              key={`${row.label}-${row.rollKind}`}
            >
              <span>
                {gameText(row.label)}
                {isStatPriority && statMode === "both" && row.rollKind === "relayed" && (
                  <span className="priority-relayed-indicator" title={t("ui.buildTab.relayedOptionLabel")}>
                    <IconArrowUp size="1em" aria-hidden />
                    <span className="visually-hidden">{t("ui.buildTab.relayedOptionLabel")}</span>
                  </span>
                )}
              </span>
              {showMaxRoll && (
                <strong className="priority-max-roll">
                  {row.maxRoll === undefined ? "—" : formatNumber(row.maxRoll)}
                </strong>
              )}
              <strong className={throughputDeltaClass(row.dpsDifference, "damage")}>
                {formatThroughputDelta(row.dpsDifference)}
              </strong>
              <strong className={throughputDeltaClass(row.increase, "damage")}>
                {deltaPrefix(row.increase)}
                {formatNumber(row.increase)}%
              </strong>
              {showHealing ? (
                <>
                  <strong className={throughputDeltaClass(row.hpsDifference, "healing")}>
                    {formatThroughputDelta(row.hpsDifference)}
                  </strong>
                  <strong className={throughputDeltaClass(row.healingIncrease, "healing")}>
                    {deltaPrefix(row.healingIncrease)}
                    {formatNumber(row.healingIncrease)}%
                  </strong>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  )
}
