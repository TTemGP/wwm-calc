import type { ChangeEventHandler, InputHTMLAttributes } from "react"

import styles from "./style.module.css"

// `role` is omitted for the same reason as `type`: both name the element's semantics, and a
// caller that could override them could turn the switch into something that is not one.
//
// `onChange` is required rather than inherited. A switch whose `checked` is set and which
// reports nothing is a control the user can move with no result, which React warns about at
// runtime; requiring the handler puts that in the type instead.
type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role" | "onChange"> & {
  onChange: ChangeEventHandler<HTMLInputElement>
}

// Switch primitive: a native checkbox carrying `role="switch"`, so the platform still supplies
// the keyboard handling, the form semantics and the checked state while the track and thumb are
// drawn by the stylesheet. Assistive technology announces the on and off vocabulary rather
// than checked and unchecked, which is what a setting that stays on is actually doing.
//
// The attributes are spread first so the ones set here win. `checked` is forwarded as well as
// mirrored into `aria-checked`: dropping it would leave the input uncontrolled, and a
// `:checked` selector that never matches leaves the thumb stuck at one end. Omitting `checked`
// leaves an uncontrolled switch, which then falls back to the native checkedness. `onChange` is
// bound as an attribute rather than left in the spread, so the element the switch is drawn from
// visibly carries the handler the type above requires.
//
// Sizing and placement live one level up, in the `.checkbox-field` and domain wrappers, as they
// do for `Checkbox`.
export function Toggle({ className, checked, onChange, ...rest }: ToggleProps) {
  return (
    <input
      {...rest}
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={onChange}
      aria-checked={checked}
      className={className ? `${styles.toggle} ${className}` : styles.toggle}
    />
  )
}
