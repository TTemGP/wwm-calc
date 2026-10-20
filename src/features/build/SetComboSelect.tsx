import type { SetSelections } from "@/gear"
import { gameText, t } from "@/i18n"

// 연운 딜 계산기: 무기·방어구 세트를 "진천 4", "화계 2 + 단비 2"처럼 조합 하나로 골라요.
// 세트마다 0/2/4를 따로 누르던 방식 대신, 이 유파에서 쓸 수 있는 세트의 조합을 전부 한 목록에 늘어놓아요.

type SetComboSelectProps = {
  label: string
  definitions: Record<string, { name: string }>
  available: ReadonlyArray<readonly [string, unknown]>
  value: SetSelections
  disabled?: boolean
  title?: string
  onChange: (next: SetSelections) => void
}

type Combo = { key: string; label: string; selections: Record<string, 2 | 4> }

function comboKey(selections: Record<string, number>, order: string[]) {
  return order
    .filter(name => (selections[name] ?? 0) > 0)
    .sort((left, right) => (selections[right] ?? 0) - (selections[left] ?? 0))
    .map(name => `${name}:${selections[name]}`)
    .join("|")
}

export function SetComboSelect({
  label,
  definitions,
  available,
  value,
  disabled,
  title,
  onChange,
}: SetComboSelectProps) {
  const order = available.map(([setName]) => setName)
  const name = (setName: string) => gameText(definitions[setName].name)
  const combo = (selections: Record<string, 2 | 4>, text: string): Combo => ({
    key: comboKey(selections, order),
    label: text,
    selections,
  })
  const four = order.map(setName => combo({ [setName]: 4 }, t("ui.buildTab.setComboFour", { name: name(setName) })))
  const pairs = order.flatMap((first, index) =>
    order
      .slice(index + 1)
      .map(second =>
        combo({ [first]: 2, [second]: 2 }, t("ui.buildTab.setComboPair", { first: name(first), second: name(second) })),
      ),
  )
  const two = order.map(setName => combo({ [setName]: 2 }, t("ui.buildTab.setComboTwo", { name: name(setName) })))
  const groups = [
    { label: t("ui.buildTab.setComboGroupFour"), combos: four },
    { label: t("ui.buildTab.setComboGroupPair"), combos: pairs },
    { label: t("ui.buildTab.setComboGroupTwo"), combos: two },
  ].filter(group => group.combos.length > 0)
  const all = groups.flatMap(group => group.combos)
  const selectedKey = comboKey(value, order)

  function choose(key: string) {
    const picked = all.find(candidate => candidate.key === key)
    onChange(Object.fromEntries(Object.keys(definitions).map(setName => [setName, picked?.selections[setName] ?? 0])))
  }

  return (
    <select
      className="set-combo-select"
      aria-label={label}
      value={all.some(candidate => candidate.key === selectedKey) ? selectedKey : ""}
      disabled={disabled}
      title={title}
      onChange={event => choose(event.target.value)}
    >
      <option value="">{t("ui.buildTab.none")}</option>
      {groups.map(group => (
        <optgroup key={group.label} label={group.label}>
          {group.combos.map(candidate => (
            <option key={candidate.key} value={candidate.key}>
              {candidate.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
