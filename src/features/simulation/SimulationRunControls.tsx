import { t } from "@/i18n"
import { Button } from "@/ui/Button"

type SimulationRunControlsProps = {
  count: string
  disabled: boolean
  running: boolean
  onCountChange: (count: string) => void
  onRun: () => void
}

/**
 * How many runs to simulate, and the button that starts them.
 *
 * The same button cancels a run in progress, so there is one control rather than two that swap
 * places, and the count is disabled while running because changing it mid-run would suggest it
 * affects the run that is already under way.
 */
export function SimulationRunControls({ count, disabled, running, onCountChange, onRun }: SimulationRunControlsProps) {
  return (
    <div className="simulation-controls">
      <label className="editor-field">
        {t("ui.simulationTab.simulationCount")}
        <input
          type="number"
          min="1"
          step="1"
          value={count}
          disabled={running}
          onChange={event => onCountChange(event.target.value)}
        />
      </label>
      <Button variant={running ? "secondary" : "primary"} type="button" disabled={disabled} onClick={onRun}>
        {running ? t("ui.simulationTab.cancel") : t("ui.simulationTab.simulate")}
      </Button>
    </div>
  )
}
