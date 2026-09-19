import { useImperativeHandle, useRef, type PointerEvent, type Ref } from 'react'
import type { CannonGroup } from '../../config/gameConfig'
import { actionLabels, type Action } from '../../shared/bindings'
import { RoundButton, type RoundIcon } from '../components/RoundButton'
import styles from './TouchControls.module.css'

export type TouchControlsHandle = { sweep(side: CannonGroup, durationMs: number): void }

type TouchControlsProps = { ref?: Ref<TouchControlsHandle>; onAction(action: Action, down: boolean): void }

type TouchButton = { action: Action; icon: RoundIcon; slot: string; side?: CannonGroup }

const steering: readonly TouchButton[] = [
  { action: 'forward', icon: 'forward', slot: styles.top },
  { action: 'turnLeft', icon: 'turnLeft', slot: styles.left },
  { action: 'turnRight', icon: 'turnRight', slot: styles.right },
]

const cannons: readonly TouchButton[] = [
  { action: 'fireFront', icon: 'fireFront', slot: styles.top, side: 'front' },
  { action: 'fireLeft', icon: 'fireLeft', slot: styles.left, side: 'left' },
  { action: 'fireRight', icon: 'fireRight', slot: styles.right, side: 'right' },
]

const sweepFrames: Keyframe[] = [{ '--sweep': '0turn' }, { '--sweep': '1turn' }]

export function TouchControls({ ref, onAction }: TouchControlsProps) {
  const sweeps = useRef<Partial<Record<CannonGroup, HTMLSpanElement | null>>>({})

  useImperativeHandle(
    ref,
    () => ({
      sweep(side, durationMs) {
        sweeps.current[side]?.animate(sweepFrames, { duration: durationMs, easing: 'linear' })
      },
    }),
    [],
  )

  const press = (action: Action) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    onAction(action, true)
  }

  const release = (action: Action) => () => onAction(action, false)

  const renderButton = ({ action, icon, slot, side }: TouchButton) => (
    <RoundButton
      key={action}
      icon={icon}
      label={actionLabels[action]}
      tabIndex={-1}
      className={`${styles.button} ${slot}`}
      onPointerDown={press(action)}
      onPointerUp={release(action)}
      onPointerCancel={release(action)}
      onLostPointerCapture={release(action)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {side && (
        <span
          className={styles.sweep}
          ref={(element) => {
            sweeps.current[side] = element
          }}
        />
      )}
    </RoundButton>
  )

  return (
    <div className={styles.controls}>
      <div className={`${styles.cluster} ${styles.steering}`} role="group" aria-label="Steering">
        {steering.map(renderButton)}
      </div>
      <div className={`${styles.cluster} ${styles.cannons}`} role="group" aria-label="Cannons">
        {cannons.map(renderButton)}
      </div>
    </div>
  )
}
