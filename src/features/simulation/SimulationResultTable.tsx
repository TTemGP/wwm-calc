import { formatNumber, formatThroughput } from "@/application/formatting"
import { t } from "@/i18n"

import type { SimulationResultRow } from "./simulationResults"

type SimulationResultTableProps = { rows: readonly SimulationResultRow[]; heals: boolean }

export function SimulationResultTable({ rows, heals }: SimulationResultTableProps) {
  return (
    <div className="simulation-results">
      <table
        className={`simulation-table${heals ? " with-healing" : ""}`}
        aria-label={t("ui.simulationTab.simulationPercentileResults")}
      >
        <tbody>
          <SimulationResultHeader heals={heals} />
          {rows.map(row => (
            <SimulationTableRow heals={heals} key={row.label} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The column headings.
 *
 * The three healing columns are only present when the run healed at all, so a simulation without
 * healing does not carry three columns of zeroes through to every row below.
 */
function SimulationResultHeader({ heals }: { heals: boolean }) {
  return (
    <tr className="simulation-table-row simulation-table-header">
      <th scope="col">{t("ui.simulationTab.result")}</th>
      <th scope="col">{t("system.totalDamage")}</th>
      <th scope="col">{t("system.dps")}</th>
      {heals ? (
        <th scope="col" className="healing-value">
          {t("system.hps")}
        </th>
      ) : null}
      <th scope="col">{t("system.abrasion")}</th>
      <th scope="col">{t("system.normal")}</th>
      <th scope="col">{t("system.critical")}</th>
      <th scope="col">{t("system.affinity")}</th>
      {heals ? <HealingOutcomeHeading outcome={t("system.normal")} /> : null}
      {heals ? <HealingOutcomeHeading outcome={t("system.critical")} /> : null}
    </tr>
  )
}

function HealingOutcomeHeading({ outcome }: { outcome: string }) {
  return (
    <th scope="col" className="healing-value">
      {t("ui.simulationTab.healingOutcome", { outcome })}
    </th>
  )
}

function SimulationTableRow({ row, heals }: { row: SimulationResultRow; heals: boolean }) {
  return (
    <tr className="simulation-table-row">
      <th scope="row">
        <strong>{row.label}</strong>
      </th>
      <td>{formatThroughput(row.result.totalDamage)}</td>
      <td>{formatThroughput(row.result.dps)}</td>
      {heals ? <HealingCell value={row.result.hps} /> : null}
      <td>{formatNumber(row.result.abrasionPercentage)}%</td>
      <td>{formatNumber(row.result.normalPercentage)}%</td>
      <td>{formatNumber(row.result.criticalPercentage)}%</td>
      <td>{formatNumber(row.result.affinityPercentage)}%</td>
      {heals ? <HealingCell value={row.result.healingNormalPercentage} /> : null}
      {heals ? <HealingCell value={row.result.healingCriticalPercentage} /> : null}
    </tr>
  )
}

function HealingCell({ value }: { value: number }) {
  return <td className="healing-value">{formatThroughput(value)}</td>
}
