import type { HTMLAttributes } from "react"

import styles from "./style.module.css"

type ChipProps = HTMLAttributes<HTMLSpanElement>

// Reusable pill behavior and base presentation. Tones (effect-plate kinds,
// status badges, percentile chips) live in application CSS and use the
// shared design tokens directly.
export function Chip({ className, ...rest }: ChipProps) {
  return <span className={className ? `${styles.chip} ${className}` : styles.chip} {...rest} />
}
