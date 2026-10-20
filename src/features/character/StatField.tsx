import { IconRestore } from "@tabler/icons-react"
import { useState } from "react"

import { formatNumber } from "@/application/formatting"
import { gameText, t } from "@/i18n"
import type { CharacterStats, StatDefinition } from "@/types"

export function StatField({
  definition,
  stats,
  onChange,
  onReset,
  modified = false,
  derivedLabel,
  derivedValue,
  derivedUnit,
  compact,
}: {
  definition: StatDefinition
  stats: CharacterStats
  onChange: (key: keyof CharacterStats, value: number) => void
  onReset?: () => void
  modified?: boolean
  derivedLabel?: string
  derivedValue?: number
  derivedUnit?: string
  compact?: boolean
}) {
  const displayValue = (value: number) => (definition.unit === "%" ? value * 100 : value)
  const [draftValue, setDraftValue] = useState(() => formatNumber(displayValue(stats[definition.key])))
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const statValue = stats[definition.key]
  const [syncedStat, setSyncedStat] = useState(() => ({ editing: false, value: statValue }))
  if (!editing && (syncedStat.editing || !Object.is(syncedStat.value, statValue))) {
    setSyncedStat({ editing, value: statValue })
    setDraftValue(formatNumber(displayValue(statValue)))
  }

  function commitValue(rawValue: string) {
    const normalized = Number(rawValue)
    const displayedValue = Number.isFinite(normalized) ? normalized : 0
    const uncappedValue = definition.unit === "%" ? displayedValue / 100 : displayedValue
    const value = Math.min(definition.maximum ?? Number.POSITIVE_INFINITY, uncappedValue)
    setDraftValue(String(displayValue(value)))
    setEditing(false)
    setDirty(false)
    onChange(definition.key, value)
  }

  function finishEditing(rawValue: string) {
    if (dirty) commitValue(rawValue)
    else {
      setEditing(false)
      setDraftValue(formatNumber(displayValue(stats[definition.key])))
    }
  }

  return (
    <label className={`field ${compact ? "compact-field" : ""} ${modified ? "modified-field" : ""}`}>
      <span className="field-label">
        <span>
          {gameText(definition.label)}
          {definition.unit && definition.showUnitInLabel !== false ? ` ${definition.unit}` : ""}
        </span>
        {modified && (
          <button
            className="stat-reset-button"
            type="button"
            aria-label={t("ui.app.resetNamedValue", { name: gameText(definition.label) })}
            title={t("ui.app.resetToCalculatedValue")}
            onClick={event => {
              event.preventDefault()
              onReset?.()
            }}
          >
            <IconRestore size="1em" aria-hidden />
          </button>
        )}
      </span>
      <span className="input-wrap">
        <input
          type="number"
          min="0"
          max={
            definition.maximum !== undefined
              ? displayValue(definition.maximum)
              : definition.unit === "%"
                ? 100
                : undefined
          }
          step={definition.step ?? "0.01"}
          value={draftValue}
          onFocus={() => {
            setEditing(true)
            setDirty(false)
          }}
          onChange={event => {
            setDraftValue(event.target.value)
            setDirty(true)
          }}
          onBlur={event => finishEditing(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
        {definition.unit && definition.showUnitInInput !== false && (
          <span className="input-unit">{definition.unit}</span>
        )}
      </span>
      {derivedLabel ? <small className="inline-derived">{derivedLabel}</small> : <span className="derived-spacer" />}
      {derivedLabel ? (
        <strong className="inline-derived-value">
          {derivedValue === undefined ? "—" : formatNumber(derivedValue)}
          {derivedUnit ?? ""}
        </strong>
      ) : (
        <span className="derived-spacer" />
      )}
    </label>
  )
}
