import { IconTrash } from "@tabler/icons-react"

import { t } from "@/i18n"
import { Chip } from "@/ui/Chip"

import { formatDuration, resultRowsHeal, simulationResultRows, type SimulationRecord } from "./simulationResults"
import { SimulationResultTable } from "./SimulationResultTable"

type SimulationResultCardProps = {
  record: SimulationRecord
  customPercentiles: readonly number[]
  currentBundleKey: string
  onDelete: (id: number) => void
}

/**
 * One recorded simulation.
 *
 * The card is labelled current or out of date by whether it was measured from the bundle that is
 * open now, which is a comparison of bundle keys rather than of results: a record is out of date
 * the moment the rotation is edited, and no amount of comparing numbers would show that.
 */
export function SimulationResultCard({
  record,
  customPercentiles,
  currentBundleKey,
  onDelete,
}: SimulationResultCardProps) {
  const current = record.bundleKey === currentBundleKey
  const rows = simulationResultRows(record.summary, customPercentiles)
  return (
    <article className="simulation-record">
      <header className="simulation-record-heading">
        <p>
          <span>
            {t("ui.simulationTab.rotation")} {record.rotationName}
          </span>
          <span>
            {t("ui.simulationTab.build")} {record.buildName}
          </span>
          <span>
            {record.summary.runCount.toLocaleString()} {t("ui.simulationTab.runs")}{" "}
            {formatDuration(record.summary.duration)}
            {t("ui.simulationTab.s")}
          </span>
          <Chip className={current ? "simulation-current" : "simulation-outdated"}>
            {current ? t("ui.simulationTab.current") : t("ui.simulationTab.outdated")}
          </Chip>
        </p>
        <button
          className="simulation-record-delete"
          type="button"
          aria-label={t("ui.simulationTab.deleteResult")}
          onClick={() => onDelete(record.id)}
        >
          <IconTrash size="1em" aria-hidden />
        </button>
      </header>
      <SimulationResultTable heals={resultRowsHeal(rows)} rows={rows} />
    </article>
  )
}
