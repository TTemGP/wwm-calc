import { IconX } from "@tabler/icons-react"
import { useEffect, useRef } from "react"

import { t } from "@/i18n"
import { Button } from "@/ui/Button"
import { Chip } from "@/ui/Chip"

import type { CustomPercentileEditor } from "./useCustomPercentiles"

type SimulationPercentileEditorProps = { editor: CustomPercentileEditor; disabled: boolean }

/**
 * The user's own percentiles, and the form for adding another.
 *
 * The input is focused when the form opens rather than when it is clicked, because the button
 * that opens it is still holding focus at that point and the user would otherwise have to reach
 * for the field they just asked for.
 */
export function SimulationPercentileEditor({ editor, disabled }: SimulationPercentileEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editor.addingPercentile) inputRef.current?.focus()
  }, [editor.addingPercentile])

  return (
    <div className="simulation-percentile-settings">
      <div className="simulation-percentile-heading">
        <strong>{t("ui.simulationTab.customPercentiles")}</strong>
        <Button
          variant="secondary"
          size="small"
          type="button"
          disabled={disabled || editor.addingPercentile}
          onClick={editor.startAdding}
        >
          {t("ui.simulationTab.addPercentile")}
        </Button>
      </div>
      {editor.customPercentiles.length > 0 && <PercentileChips editor={editor} disabled={disabled} />}
      {editor.addingPercentile && <PercentileAddForm editor={editor} inputRef={inputRef} />}
      {editor.percentileError && (
        <p className="simulation-percentile-error" role="alert">
          {editor.percentileError}
        </p>
      )}
    </div>
  )
}

function PercentileChips({ editor, disabled }: SimulationPercentileEditorProps) {
  return (
    <div className="simulation-percentile-chips">
      {editor.customPercentiles.map(percentile => (
        <Chip className="simulation-percentile-chip" key={percentile}>
          {t("ui.simulationTab.p")}
          {percentile}
          <button
            type="button"
            aria-label={t("ui.simulationTab.removePercentile", { percentile })}
            disabled={disabled}
            onClick={() => editor.removePercentile(percentile)}
          >
            <IconX size="1em" aria-hidden />
          </button>
        </Chip>
      ))}
    </div>
  )
}

type PercentileAddFormProps = { editor: CustomPercentileEditor; inputRef: React.RefObject<HTMLInputElement | null> }

function PercentileAddForm({ editor, inputRef }: PercentileAddFormProps) {
  return (
    <div className="simulation-percentile-add">
      <label>
        <span>{t("ui.simulationTab.p")}</span>
        <input
          ref={inputRef}
          type="number"
          min="0"
          max="99.999999"
          step="any"
          value={editor.percentileDraft}
          onChange={event => editor.setPercentileDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") editor.addPercentile()
            if (event.key === "Escape") editor.stopAdding()
          }}
        />
      </label>
      <Button variant="primary" size="small" type="button" onClick={editor.addPercentile}>
        {t("ui.simulationTab.add")}
      </Button>
      <Button variant="secondary" size="small" type="button" onClick={editor.stopAdding}>
        {t("ui.simulationTab.cancel")}
      </Button>
    </div>
  )
}
