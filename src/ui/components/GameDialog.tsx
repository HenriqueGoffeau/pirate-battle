import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react'
import { WoodPanel } from './WoodPanel'
import styles from './GameDialog.module.css'

type GameDialogProps = {
  open: boolean
  title: string
  actions: ReactNode
  children?: ReactNode
  panelClassName?: string
  onCancel?(): void
  onKeyDown?(event: KeyboardEvent<HTMLDialogElement>): void
}

export function GameDialog({ open, title, actions, children, panelClassName, onCancel, onKeyDown }: GameDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  const cancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    onCancel?.()
  }

  const keepOpen = (event: SyntheticEvent<HTMLDialogElement>) => {
    if (open && event.currentTarget.isConnected) event.currentTarget.showModal()
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={cancel}
      onClose={keepOpen}
      onKeyDown={onKeyDown}
    >
      <WoodPanel className={[styles.panel, panelClassName].filter(Boolean).join(' ')}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
        <div className={styles.actions}>{actions}</div>
      </WoodPanel>
    </dialog>
  )
}
