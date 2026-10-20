import { t } from "@/i18n"

type SimulationProgressProps = { completed: number; total: number }

/**
 * How far a run has got, announced as it changes.
 *
 * The bar is left to the element and the text carries the numbers, because a `progress` element
 * has no accessible value of its own and the count is what the user is waiting on.
 */
export function SimulationProgress({ completed, total }: SimulationProgressProps) {
  const percent = total > 0 ? (completed / total) * 100 : 0
  return (
    <output className="simulation-progress" aria-live="polite">
      <progress max={total} value={completed} />
      <span>
        {completed.toLocaleString()} / {total.toLocaleString()} {t("ui.simulationTab.progressRunsPrefix")}
        {percent.toFixed(0)}
        %)
      </span>
    </output>
  )
}
