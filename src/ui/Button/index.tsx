import type { ButtonHTMLAttributes } from "react"

import styles from "./style.module.css"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger"
  size?: "small"
  /**
   * For a button whose only content is an icon. The icon is sized in `em`, so the button
   * takes a square footprint from it and centres the glyph, which keeps every icon-only
   * action the same size without each call site restating it.
   */
  iconOnly?: boolean
}

export function Button({ type = "button", variant, size, iconOnly, className, ...rest }: ButtonProps) {
  const classes = [styles.button]
  if (variant) classes.push(styles[variant])
  if (size) classes.push(styles[size])
  if (iconOnly) classes.push(styles["icon-only"])
  if (className) classes.push(className)

  return <button type={type} data-button="" className={classes.join(" ")} {...rest} />
}
