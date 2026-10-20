import type { HTMLAttributes } from "react"

import styles from "./style.module.css"

type PanelProps = HTMLAttributes<HTMLElement>
type PanelHeadingProps = HTMLAttributes<HTMLDivElement>

// Reusable panel behavior and base presentation. Domain-specific layout and
// visual overrides live in application CSS and use the shared design tokens
// directly.
export function Panel({ className, ...rest }: PanelProps) {
  return <section data-panel="" className={className ? `${styles.panel} ${className}` : styles.panel} {...rest} />
}

export function PanelHeading({ className, ...rest }: PanelHeadingProps) {
  return (
    <div data-panel-heading="" className={className ? `${styles.heading} ${className}` : styles.heading} {...rest} />
  )
}
