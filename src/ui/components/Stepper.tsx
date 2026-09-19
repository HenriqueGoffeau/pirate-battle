import { useId } from 'react'
import { RoundButton } from './RoundButton'
import styles from './Stepper.module.css'

type StepperProps = {
  label: string
  draft: string
  limits: { readonly min: number; readonly max: number; readonly step: number }
  error: string | null
  onDraft(draft: string): void
  onStep(direction: 1 | -1): void
}

export function Stepper({ label, draft, limits, error, onDraft, onStep }: StepperProps) {
  const id = useId()
  const value = Number(draft)
  const valid = draft.trim() !== '' && Number.isFinite(value)
  return (
    <div role="group" aria-labelledby={`${id}-label`} className={styles.stepper}>
      <label id={`${id}-label`} htmlFor={`${id}-input`} className={styles.label}>
        {label}
      </label>
      <div className={styles.row}>
        <RoundButton
          icon="minus"
          size="small"
          label={`Decrease ${label.toLowerCase()}`}
          disabled={valid && value <= limits.min}
          onClick={() => onStep(-1)}
        />
        <span className={styles.field}>
          <input
            id={`${id}-input`}
            className={styles.input}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={draft}
            style={{ width: `${Math.max(draft.length, 1) + 0.4}ch` }}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-limits${error ? ` ${id}-error` : ''}`}
            onChange={(event) => onDraft(event.target.value)}
          />
          <span className={styles.unit} aria-hidden="true">
            s
          </span>
        </span>
        <RoundButton
          icon="plus"
          size="small"
          label={`Increase ${label.toLowerCase()}`}
          disabled={valid && value >= limits.max}
          onClick={() => onStep(1)}
        />
      </div>
      <p id={`${id}-limits`} className={styles.limits}>
        {limits.min}–{limits.max} seconds, steps of {limits.step}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
