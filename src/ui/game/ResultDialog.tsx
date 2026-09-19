import { useEffect, useState } from 'react'
import type { MatchRecord } from '../../data/contracts/types'
import type { SaveStatus } from '../../data/outbox'
import { formatClock } from '../../shared/format'
import { GameDialog } from '../components/GameDialog'
import { GoldButton } from '../components/GoldButton'
import styles from './ResultDialog.module.css'

type ResultDialogProps = {
  record: MatchRecord | null
  status: SaveStatus | null
  onRetry(): void
  onPlayAgain(): void
  onMainMenu(): void
}

function titleFor(record: MatchRecord | null): string {
  if (!record) return 'No battle yet'
  return record.endReason === 'timeUp' ? 'You survived the attack' : 'Your ship was sunk'
}

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])
  const seconds = Math.ceil((until - now) / 1000)
  return <span aria-hidden="true">{seconds > 0 ? `· retry in ${seconds} s` : '· retrying…'}</span>
}

const statusText = (status: SaveStatus) => {
  switch (status.kind) {
    case 'saving':
      return 'Saving to the captain’s log…'
    case 'saved':
      return 'Saved to the captain’s log'
    case 'pending':
      return status.offline ? 'Not saved yet · kept on this device (offline mode)' : 'Not saved yet'
    case 'failed':
      return `Couldn’t save: ${status.message}`
  }
}

function SaveRow({ status, onRetry }: { status: SaveStatus; onRetry(): void }) {
  const retryable = status.kind === 'pending' && !status.offline
  return (
    <div className={styles.save}>
      <p role="status" className={[styles.saveText, styles[status.kind]].filter(Boolean).join(' ')}>
        {statusText(status)}
      </p>
      {retryable && status.retryAt !== null && <Countdown key={status.retryAt} until={status.retryAt} />}
      {retryable && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Retry now
        </button>
      )}
    </div>
  )
}

export function ResultDialog({ record, status, onRetry, onPlayAgain, onMainMenu }: ResultDialogProps) {
  const survived = record?.endReason === 'timeUp'
  return (
    <GameDialog
      open
      title={titleFor(record)}
      panelClassName={styles.panel}
      actions={
        <>
          <GoldButton data-autofocus onClick={onPlayAgain}>
            {record ? 'Play Again' : 'Play'}
          </GoldButton>
          <GoldButton onClick={onMainMenu}>Main Menu</GoldButton>
        </>
      }
    >
      {record ? (
        <>
          <p className={styles.score}>{record.score}</p>
          <p className={styles.caption}>
            Points · <time dateTime={`PT${record.effectiveSec}S`}>{formatClock(record.effectiveSec)}</time> ·{' '}
            <span className={survived ? styles.survived : styles.defeated}>{survived ? "Time's up" : 'Defeated'}</span>
          </p>
          {record.custom && <p className={styles.custom}>Custom balance · not ranked</p>}
          {status && <SaveRow status={status} onRetry={onRetry} />}
        </>
      ) : (
        <p className={styles.caption}>Finish a battle to see its result here.</p>
      )}
    </GameDialog>
  )
}
