import { useEffect, useRef, type ReactNode, type SyntheticEvent } from "react"

import styles from "./style.module.css"

type DialogProps = {
  open: boolean
  onClose: () => void
  onCancel?: (event: SyntheticEvent<HTMLDialogElement, Event>) => void
  className?: string
  label?: string
  children: ReactNode
}

// Reusable dialog behavior and base presentation. Content-specific layout
// lives in application classes and uses the shared design tokens directly.
export function Dialog({ open, onClose, onCancel, className, label, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  const handleClose = (event: SyntheticEvent<HTMLDialogElement, Event>) => {
    event.stopPropagation()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className={className ? `${styles.dialog} ${className}` : styles.dialog}
      aria-label={label}
      onCancel={onCancel}
      onClose={handleClose}
    >
      {children}
    </dialog>
  )
}
