import { useMemo, type CSSProperties } from "react"

import styles from "./style.module.css"

/**
 * Reports that a calculation is under way, and how far along it is.
 *
 * A progress of undefined means the calculation reports no intermediate steps. That is not
 * the same as zero progress, so it renders without a percentage rather than claiming a
 * stalled start. The caller supplies the wording, because what a calculation is called is
 * the caller's to decide, and this stays independent of any particular calculation.
 */
export function CalculationStatus({
  busy,
  progress,
  label,
  className,
}: {
  busy: boolean
  progress?: number
  label: string
  className?: string
}) {
  const percentage = progress === undefined ? undefined : Math.round(progress * 100)
  const progressStyle = useMemo(
    () => (percentage === undefined ? undefined : ({ "--calculation-progress": `${percentage}%` } as CSSProperties)),
    [percentage],
  )
  const indeterminate = busy && percentage === undefined
  const primitiveClass = primitiveClassName(busy, indeterminate)
  return (
    <div
      data-calculation-status=""
      data-busy={busy || undefined}
      className={className ? `${primitiveClass} ${className}` : primitiveClass}
      style={progressStyle}
      aria-live="polite"
    >
      <progress
        className="visually-hidden"
        max={100}
        {...(percentage === undefined ? {} : { value: busy ? percentage : 100 })}
        aria-label={label}
      />
      {label}
    </div>
  )
}

function primitiveClassName(busy: boolean, indeterminate: boolean) {
  if (indeterminate) return `${styles.status} ${styles.indeterminate}`
  if (busy) return styles.status
  return `${styles.status} ${styles.idle}`
}
