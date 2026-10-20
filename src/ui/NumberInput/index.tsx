import { useState, type InputHTMLAttributes } from "react"

import { commitDraft, isValidDraft } from "./commit"

import styles from "./style.module.css"

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max" | "step"
> & {
  value: string | number | undefined
  /** Separate lower bound: rendered as the min attribute and used to clamp on commit. */
  min?: number
  /** Separate upper bound: rendered as the max attribute and used to clamp on commit. */
  max?: number
  step?: number | string
  /**
   * "commit" keeps a local draft while editing and reports the parsed,
   * clamped number on blur or Enter. "immediate" reports the raw string on
   * every keystroke and stays fully controlled (the parent owns capping).
   */
  commitMode?: "immediate" | "commit"
  allowEmpty?: boolean
  onChange?: (raw: string) => void
  onCommit?: (value: number | undefined) => void
  onEditingChange?: (editing: boolean) => void
  onValidityChange?: (valid: boolean) => void
}

type NumberInputControllerProps = Pick<
  NumberInputProps,
  "value" | "min" | "max" | "onChange" | "onCommit" | "onEditingChange" | "onValidityChange"
> & { commitMode: "immediate" | "commit"; allowEmpty: boolean }

type NumberInputNativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max" | "step" | "inputMode" | "className" | "onBlur" | "onKeyDown"
>

type NumberInputElementProps = {
  nativeProps: NumberInputNativeProps
  value: string | number | undefined
  draft: string | undefined
  min?: number
  max?: number
  step?: number | string
  inputMode?: NumberInputProps["inputMode"]
  className?: string
  commitMode: "immediate" | "commit"
  invalid: boolean
  onDraft: (raw: string) => void
  onCommit: () => void
  onBlur?: NumberInputProps["onBlur"]
  onKeyDown?: NumberInputProps["onKeyDown"]
}

function useNumberInputController({
  value,
  min,
  max,
  commitMode,
  allowEmpty,
  onChange,
  onCommit,
  onEditingChange,
  onValidityChange,
}: NumberInputControllerProps) {
  const [draft, setDraft] = useState<string>()
  const evaluated = draft ?? (commitMode === "immediate" ? (value ?? "") : undefined)
  const invalid = evaluated !== undefined && !isValidDraft(String(evaluated), allowEmpty, min, max)

  function handleDraft(raw: string) {
    if (commitMode === "commit") setDraft(raw)
    onChange?.(raw)
    onEditingChange?.(true)
    onValidityChange?.(isValidDraft(raw, allowEmpty, min, max))
  }

  function handleCommit() {
    if (draft === undefined) return
    onCommit?.(commitDraft(draft, { allowEmpty, min, max }))
    setDraft(undefined)
    onEditingChange?.(false)
  }

  return { draft, invalid, handleDraft, handleCommit }
}

function NumberInputElement({
  nativeProps,
  value,
  draft,
  min,
  max,
  step,
  inputMode,
  className,
  commitMode,
  invalid,
  onDraft,
  onCommit,
  onBlur,
  onKeyDown,
}: NumberInputElementProps) {
  return (
    <input
      {...nativeProps}
      type="number"
      min={min}
      max={max}
      step={step}
      inputMode={inputMode}
      aria-invalid={invalid || undefined}
      className={className ? `${styles.input} ${className}` : styles.input}
      value={draft ?? value ?? ""}
      onChange={event => onDraft(event.target.value)}
      onBlur={event => {
        if (commitMode === "commit") onCommit()
        onBlur?.(event)
      }}
      onKeyDown={event => {
        if (commitMode === "commit" && event.key === "Enter") {
          event.preventDefault()
          onCommit()
        }
        onKeyDown?.(event)
      }}
    />
  )
}

// Numeric input with separately controlled bounds, step size, and range
// evaluation. Visual styling lives one level up (field, editor-field,
// detail-field wrappers). Never reference project design tokens here.
export function NumberInput(props: NumberInputProps) {
  const {
    value,
    min,
    max,
    step,
    inputMode,
    className,
    onBlur,
    onKeyDown,
    commitMode = "commit",
    allowEmpty = false,
    onChange,
    onCommit,
    onEditingChange,
    onValidityChange,
    ...nativeProps
  } = props
  const { draft, invalid, handleDraft, handleCommit } = useNumberInputController({
    value,
    min,
    max,
    commitMode,
    allowEmpty,
    onChange,
    onCommit,
    onEditingChange,
    onValidityChange,
  })

  return (
    <NumberInputElement
      nativeProps={nativeProps}
      value={value}
      draft={draft}
      min={min}
      max={max}
      step={step}
      inputMode={inputMode}
      className={className}
      commitMode={commitMode}
      invalid={invalid}
      onDraft={handleDraft}
      onCommit={handleCommit}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  )
}
