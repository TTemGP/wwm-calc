import { useState } from "react"

import { normalizeEnemyCount } from "../../calculations/combatDefaults"
import { t } from "../../i18n"

type Props = { value: number; disabled: boolean; onCommit: (value: number) => void }

export function RotationEnemyCountField({ value, disabled, onCommit }: Props) {
  const [draft, setDraft] = useState<string>()
  function commit() {
    if (draft === undefined) return
    onCommit(normalizeEnemyCount(Number(draft)))
    setDraft(undefined)
  }
  return (
    <label className="field compact-field rotation-target-hp rotation-enemy-count">
      <span className="field-label">{t("ui.app.enemyCount")}</span>
      <input
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        disabled={disabled}
        value={draft ?? value}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
          }
        }}
      />
    </label>
  )
}
