import type { MatchResult } from '../../session/store'
import { formatClock } from '../../shared/format'
import { GameDialog } from '../components/GameDialog'
import { GoldButton } from '../components/GoldButton'
import styles from './ResultDialog.module.css'

type ResultDialogProps = { result: MatchResult | null; onPlayAgain(): void; onMainMenu(): void }

function titleFor(result: MatchResult | null): string {
  if (!result) return 'No battle yet'
  return result.endReason === 'timeUp' ? 'You survived the attack' : 'Your ship was sunk'
}

export function ResultDialog({ result, onPlayAgain, onMainMenu }: ResultDialogProps) {
  const survived = result?.endReason === 'timeUp'
  return (
    <GameDialog
      open
      title={titleFor(result)}
      panelClassName={styles.panel}
      actions={
        <>
          <GoldButton onClick={onPlayAgain}>{result ? 'Play Again' : 'Play'}</GoldButton>
          <GoldButton onClick={onMainMenu}>Main Menu</GoldButton>
        </>
      }
    >
      {result ? (
        <>
          <p className={styles.score}>{result.score}</p>
          <p className={styles.caption}>
            Points · <time dateTime={`PT${result.effectiveSec}S`}>{formatClock(result.effectiveSec)}</time> ·{' '}
            <span className={survived ? styles.survived : styles.defeated}>{survived ? "Time's up" : 'Defeated'}</span>
          </p>
        </>
      ) : (
        <p className={styles.caption}>Finish a battle to see its result here.</p>
      )}
    </GameDialog>
  )
}
