import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  OptionLimits,
  optionKeys,
  validateOptions,
  type OptionErrors,
  type OptionKey,
  type UserOptions,
} from '../../config/userOptions'
import { loadOptions, saveOptions } from '../../data/local'
import { GoldButton } from '../components/GoldButton'
import { MenuScene } from '../components/MenuScene'
import { Stepper } from '../components/Stepper'
import { useHeadingFocus } from '../components/useHeadingFocus'
import { WoodPanel } from '../components/WoodPanel'
import styles from './Options.module.css'

type Drafts = Record<OptionKey, string>
type SaveStatus = 'idle' | 'saved' | 'failed'

const labels: Record<OptionKey, string> = { sessionSeconds: 'Game session time', spawnIntervalSec: 'Enemy spawn time' }

const toDrafts = (options: UserOptions): Drafts => ({
  sessionSeconds: String(options.sessionSeconds),
  spawnIntervalSec: String(options.spawnIntervalSec),
})

const parseDraft = (draft: string) => (draft.trim() === '' ? Number.NaN : Number(draft))

function stepValue(key: OptionKey, draft: string, fallback: number, direction: 1 | -1): number {
  const { min, max, step } = OptionLimits[key]
  const current = parseDraft(draft)
  const base = Number.isFinite(current) ? min + Math.round((current - min) / step) * step : fallback
  return Math.min(max, Math.max(min, base + direction * step))
}

export function Options() {
  const navigate = useNavigate()
  const headingRef = useHeadingFocus<HTMLHeadingElement>()
  const [saved, setSaved] = useState(loadOptions)
  const [drafts, setDrafts] = useState(() => toDrafts(saved))
  const [shown, setShown] = useState<Record<OptionKey, boolean>>({ sessionSeconds: false, spawnIntervalSec: false })
  const [status, setStatus] = useState<SaveStatus>('idle')

  const validation = validateOptions({
    sessionSeconds: parseDraft(drafts.sessionSeconds),
    spawnIntervalSec: parseDraft(drafts.spawnIntervalSec),
  })
  const errors: OptionErrors = validation.ok ? {} : validation.errors
  const dirty = optionKeys.some((key) => drafts[key] !== String(saved[key]))

  const update = (key: OptionKey, draft: string, reveal: boolean) => {
    setDrafts((current) => ({ ...current, [key]: draft }))
    if (reveal) setShown((current) => ({ ...current, [key]: true }))
    setStatus('idle')
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setShown({ sessionSeconds: true, spawnIntervalSec: true })
    if (!validation.ok) return
    const stored = saveOptions(validation.options)
    if (stored) {
      setSaved(validation.options)
      setDrafts(toDrafts(validation.options))
    }
    setStatus(stored ? 'saved' : 'failed')
  }

  return (
    <MenuScene>
      <WoodPanel className={styles.panel}>
        <form className={styles.form} onSubmit={save} noValidate>
          <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
            Options
          </h1>
          <div className={styles.fields}>
            {optionKeys.map((key) => (
              <div key={key} onBlur={() => setShown((current) => ({ ...current, [key]: true }))}>
                <Stepper
                  label={labels[key]}
                  draft={drafts[key]}
                  limits={OptionLimits[key]}
                  error={shown[key] ? (errors[key] ?? null) : null}
                  onDraft={(draft) => update(key, draft, false)}
                  onStep={(direction) => update(key, String(stepValue(key, drafts[key], saved[key], direction)), true)}
                />
              </div>
            ))}
          </div>
          <p className={styles.status} role="status">
            {status === 'saved' && 'Saved. Applies to your next battle.'}
            {status === 'failed' && 'Could not save: this browser is blocking storage.'}
            {status === 'idle' && (dirty ? 'Unsaved changes.' : 'Changes apply to your next battle.')}
          </p>
          <div className={styles.actions}>
            <GoldButton type="submit">Save</GoldButton>
            <GoldButton onClick={() => void navigate('/')}>Main Menu</GoldButton>
          </div>
        </form>
      </WoodPanel>
    </MenuScene>
  )
}
