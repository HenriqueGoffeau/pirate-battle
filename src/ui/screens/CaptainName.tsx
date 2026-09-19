import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { loadPlayer, nameLimits, renamePlayer, validatePlayerName } from '../../data/local'
import { GoldButton } from '../components/GoldButton'
import { RoundButton } from '../components/RoundButton'
import styles from './CaptainName.module.css'

export function CaptainName() {
  const id = useId()
  const [player, setPlayer] = useState(loadPlayer)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const editRef = useRef<HTMLButtonElement>(null)

  const startEditing = () => {
    setDraft(player.name)
    setError(null)
    setEditing(true)
  }

  const stopEditing = () => {
    setEditing(false)
    requestAnimationFrame(() => editRef.current?.focus())
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const problem = validatePlayerName(draft)
    if (problem) {
      setError(problem)
      return
    }
    setPlayer(renamePlayer(player, draft))
    stopEditing()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    stopEditing()
  }

  if (!editing) {
    return (
      <div className={styles.name}>
        <span className={styles.label}>Captain</span>
        <span className={styles.value}>{player.name}</span>
        <RoundButton ref={editRef} icon="edit" size="small" label="Change captain name" onClick={startEditing} />
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={save} noValidate>
      <label htmlFor={`${id}-name`} className="visually-hidden">
        Captain name
      </label>
      <input
        id={`${id}-name`}
        className={styles.input}
        value={draft}
        maxLength={nameLimits.max + 10}
        autoComplete="nickname"
        autoFocus
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <GoldButton type="submit" className={styles.save}>
        Save
      </GoldButton>
      <GoldButton variant="secondary" className={styles.save} onClick={stopEditing}>
        Cancel
      </GoldButton>
      {error && (
        <p id={`${id}-error`} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  )
}
