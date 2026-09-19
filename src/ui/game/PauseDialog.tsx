import type { KeyboardEvent } from 'react'
import { GameDialog } from '../components/GameDialog'
import { GoldButton } from '../components/GoldButton'
import styles from './PauseDialog.module.css'

type PauseDialogProps = { open: boolean; onResume(): void; onMainMenu(): void }

export function PauseDialog({ open, onResume, onMainMenu }: PauseDialogProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.code === 'Escape' && event.repeat) event.preventDefault()
    if (event.code !== 'KeyP') return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) onResume()
  }

  return (
    <GameDialog
      open={open}
      title="Paused"
      onCancel={onResume}
      onKeyDown={onKeyDown}
      actions={
        <>
          <GoldButton onClick={onResume}>Resume</GoldButton>
          <GoldButton onClick={onMainMenu}>Main Menu</GoldButton>
        </>
      }
    >
      <p className={styles.text}>Ready when you are.</p>
    </GameDialog>
  )
}
