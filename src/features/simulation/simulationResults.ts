import {
  selectSimulationPercentile,
  type SimulationRunResult,
  type SimulationSummary,
} from "@/calculations/simulationCalculator"
import { t } from "@/i18n"

/**
 * One finished simulation, kept alongside the names and bundle it was measured from so a result
 * recorded against an earlier bundle can be recognised as out of date rather than silently
 * compared against the current one.
 */
export type SimulationRecord = {
  id: number
  summary: SimulationSummary
  bundleKey: string
  rotationName: string
  buildName: string
}

export type SimulationResultRow = { label: string; percentile: number; result: SimulationRunResult }

/**
 * A finished run, as it is kept.
 *
 * The rotation and build names are resolved to a placeholder here rather than at the point of
 * display, so a record still reads sensibly once the tab has moved on to another rotation.
 */
export function createSimulationRecord(
  id: number,
  summary: SimulationSummary,
  source: { bundleKey?: string; rotationName?: string; buildName?: string },
): SimulationRecord {
  return {
    id,
    summary,
    bundleKey: source.bundleKey ?? "",
    rotationName: source.rotationName ?? t("ui.simulationTab.activeRotation"),
    buildName: source.buildName ?? t("ui.simulationTab.activeBuild"),
  }
}

export function formatDuration(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * The rows the results table shows, highest percentile first.
 *
 * The five presets and the best case are always present; the custom percentiles are the user's own
 * and are resolved from the runs rather than stored on the summary.
 */
export function simulationResultRows(
  summary: SimulationSummary,
  customPercentiles: readonly number[],
): SimulationResultRow[] {
  const fixed: SimulationResultRow[] = [
    { label: t("ui.simulationTab.best"), percentile: 101, result: summary.results.best },
    { label: "P99", percentile: 99, result: summary.results.p99 },
    { label: "P95", percentile: 95, result: summary.results.p95 },
    { label: "P90", percentile: 90, result: summary.results.p90 },
    { label: "P75", percentile: 75, result: summary.results.p75 },
    { label: t("ui.simulationTab.median"), percentile: 50, result: summary.results.median },
  ]
  const custom = customPercentiles.map<SimulationResultRow>(percentile => ({
    label: `P${percentile}`,
    percentile,
    result: selectSimulationPercentile(summary.runs, percentile / 100),
  }))
  return [...fixed, ...custom].toSorted((left, right) => right.percentile - left.percentile)
}

/**
 * Whether any row healed, which is what decides if the table carries the healing columns. A
 * simulation with no healing in it should not show three columns of zeroes, so this is asked of
 * the rows rather than assumed from the run count.
 */
export function resultRowsHeal(rows: readonly SimulationResultRow[]) {
  return rows.some(({ result }) => result.totalHealing > 0)
}
