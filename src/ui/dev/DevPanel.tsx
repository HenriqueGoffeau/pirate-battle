import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, useSyncExternalStore } from 'react'
import { validateBalance } from '../../config/balance'
import { GameConfig } from '../../config/gameConfig'
import { isCustomBalance } from '../../config/matchConfig'
import { clearDevBalance, loadDevBalance, saveDevBalance } from '../../data/local'
import { clearOutbox, failedCount, pendingCount, useOutbox } from '../../data/outbox'
import { GameDialog } from '../components/GameDialog'
import { GoldButton } from '../components/GoldButton'
import { tabId } from '../components/tabId'
import { Tabs, type TabItem } from '../components/Tabs'
import { useDevControls, type MockControls } from './devControls'
import styles from './DevPanel.module.css'

type DevTab = 'network' | 'balance'

const tabs: readonly TabItem<DevTab>[] = [
  { id: 'network', label: 'Network' },
  { id: 'balance', label: 'Balance' },
]

const shownRequests = 8

const shortPath = (path: string) => path.replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '$1…')

function MockNetwork({ controls }: { controls: MockControls }) {
  const id = useId()
  const queryClient = useQueryClient()
  const outbox = useOutbox()
  const [scenario, setScenario] = useState(controls.getScenario)
  const [notice, setNotice] = useState('')
  const log = useSyncExternalStore(controls.subscribe, controls.getRequestLog)
  const about = controls.scenarios.find((entry) => entry.id === scenario)

  const select = (next: string) => {
    controls.setScenario(next)
    setScenario(next)
    setNotice('Scenario changed. Its request counter starts again.')
    void queryClient.invalidateQueries()
  }

  const reset = () => {
    controls.resetServer()
    setNotice('Server reset to the scenario’s starting records.')
    void queryClient.invalidateQueries()
  }

  const clear = () => {
    clearOutbox()
    setNotice('Outbox cleared.')
  }

  return (
    <div className={styles.section}>
      <label className={styles.label} htmlFor={`${id}-scenario`}>
        Scenario
      </label>
      <select
        id={`${id}-scenario`}
        className={styles.select}
        value={scenario}
        aria-describedby={`${id}-about`}
        onChange={(event) => select(event.target.value)}
      >
        {controls.scenarios.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      <p id={`${id}-about`} className={styles.note}>
        {about?.description} Empty and Many pages bring their own records, so switching to or from them resets the server.
      </p>
      <div className={styles.buttons}>
        <GoldButton variant="secondary" onClick={reset}>
          Reset server
        </GoldButton>
        <GoldButton variant="secondary" onClick={clear}>
          Clear outbox
        </GoldButton>
      </div>
      <p className={styles.note}>
        Outbox: {pendingCount(outbox)} waiting · {failedCount(outbox)} failed
      </p>
      <p className={styles.notice} role="status">
        {notice}
      </p>
      <h3 className={styles.subtitle}>Last requests</h3>
      {log.length === 0 ? (
        <p className={styles.note}>No requests yet.</p>
      ) : (
        <div className={styles.scroller}>
          <table className={styles.log}>
            <thead className="visually-hidden">
              <tr>
                <th scope="col">Number</th>
                <th scope="col">Request</th>
                <th scope="col">Status</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {log
                .slice(-shownRequests)
                .reverse()
                .map((entry) => (
                  <tr key={entry.id}>
                    <td>#{entry.id}</td>
                    <td>
                      {entry.method} {shortPath(entry.path)}
                    </td>
                    <td className={entry.status === null ? undefined : typeof entry.status === 'number' && entry.status < 400 ? styles.ok : styles.bad}>
                      {entry.status ?? '…'}
                    </td>
                    <td>{entry.ms === null ? '' : `${entry.ms} ms`}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NetworkTab() {
  const controls = useDevControls()
  if (!controls) {
    return <p className={styles.note}>The mocks are not running (offline mode), so there are no network scenarios to choose.</p>
  }
  return <MockNetwork controls={controls} />
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2)

function BalanceTab() {
  const id = useId()
  const [draft, setDraft] = useState(() => pretty(loadDevBalance() ?? GameConfig))
  const [notice, setNotice] = useState('')
  const [error, setError] = useState<string | null>(null)

  const report = (message: string, failed: boolean) => {
    setNotice(failed ? '' : message)
    setError(failed ? message : null)
  }

  const apply = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    } catch (problem) {
      report(`This is not valid JSON. ${problem instanceof Error ? problem.message : ''}`, true)
      return
    }
    const result = validateBalance(parsed)
    if (!result.ok) {
      report(result.error, true)
      return
    }
    if (!isCustomBalance(result.balance)) {
      clearDevBalance()
      report('Same as the default balance, so your next battles are ranked normally.', false)
      return
    }
    if (!saveDevBalance(result.balance)) {
      report('Could not save: this browser is blocking storage.', true)
      return
    }
    report('Applied. Your next battle uses this balance; its record is marked custom and left out of the ranking.', false)
  }

  const reset = () => {
    clearDevBalance()
    setDraft(pretty(GameConfig))
    report('Back to the default balance.', false)
  }

  return (
    <div className={styles.section}>
      <label className={styles.label} htmlFor={`${id}-json`}>
        GameConfig (JSON)
      </label>
      <textarea
        id={`${id}-json`}
        className={styles.json}
        value={draft}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
        onChange={(event) => {
          setDraft(event.target.value)
          report('', false)
        }}
      />
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.notice} role="status">
        {notice}
      </p>
      <p id={`${id}-help`} className={styles.note}>
        Applies from your next battle while dev mode is on. Session time and spawn interval stay on the Options screen.
      </p>
      <div className={styles.buttons}>
        <GoldButton onClick={apply}>Apply</GoldButton>
        <GoldButton variant="secondary" onClick={reset}>
          Reset
        </GoldButton>
      </div>
    </div>
  )
}

type DevPanelProps = { open: boolean; onClose(): void; onDisable(): void }

export function DevPanel({ open, onClose, onDisable }: DevPanelProps) {
  const panelId = useId()
  const [tab, setTab] = useState<DevTab>('network')
  return (
    <GameDialog
      open={open}
      title="Dev tools"
      panelClassName={styles.panel}
      onCancel={onClose}
      actions={
        <div className={styles.actions}>
          <GoldButton onClick={onClose}>Close</GoldButton>
          <GoldButton variant="secondary" onClick={onDisable}>
            Exit dev mode
          </GoldButton>
        </div>
      }
    >
      <Tabs label="Dev tools" tabs={tabs} active={tab} panelId={panelId} onSelect={(next) => setTab(next)} />
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(panelId, tab)} className={styles.tabPanel}>
        {open && (tab === 'network' ? <NetworkTab /> : <BalanceTab />)}
      </div>
    </GameDialog>
  )
}
