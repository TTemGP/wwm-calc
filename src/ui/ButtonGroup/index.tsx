import { useMemo } from "react"
import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react"

import styles from "./style.module.css"

type ButtonGroupProps = {
  children: ReactNode
  /**
   * Narrowest an option may become before the group wraps to another row. Options share the
   * available width equally above that, so a group of two fills its panel just as a group of
   * four does. The `fr` maximum is what makes them equal; this only sets where wrapping
   * begins.
   */
  cellWidth?: string
  /** Keep this many options per row instead of wrapping by minimum cell width. */
  columns?: number
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">

/**
 * A set of mutually exclusive options drawn as one element rather than as a grid of
 * separate buttons: options share a single border, and each is separated from its
 * neighbour by one line instead of two.
 */
export function ButtonGroup({ children, cellWidth, columns, className, style, ...rest }: ButtonGroupProps) {
  const groupStyle = useMemo(
    () =>
      ({
        "--button-group-cell": cellWidth,
        gridTemplateColumns: columns ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
        ...style,
      }) as CSSProperties,
    [cellWidth, columns, style],
  )
  const groupClass = className ? `${styles.group} ${className}` : styles.group
  return (
    <div data-button-group="" className={groupClass} style={groupStyle} {...rest}>
      {children}
    </div>
  )
}

/**
 * One option in a `ButtonGroup`.
 *
 * `label` is the option itself. Anything passed as children is a note about it — what
 * choosing it would change, or that it is the one already chosen — and is rendered as the
 * quieter second line, so the two are never read as peers.
 */
export function ButtonGroupOption({
  label,
  selected = false,
  children,
  className,
  ...rest
}: { label: ReactNode; selected?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const optionClass = className ? `${styles.option} ${className}` : styles.option
  return (
    <button
      type="button"
      data-button-group-option=""
      data-selected={selected || undefined}
      aria-pressed={selected}
      className={optionClass}
      {...rest}
    >
      <span className={styles.label}>{label}</span>
      {children ? <span className={styles.note}>{children}</span> : null}
    </button>
  )
}
