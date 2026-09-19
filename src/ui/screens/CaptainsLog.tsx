import { useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { loadOptions, loadPlayer } from '../../data/local'
import { GoldButton } from '../components/GoldButton'
import { MenuScene } from '../components/MenuScene'
import { tabId } from '../components/tabId'
import { Tabs, type TabItem } from '../components/Tabs'
import { useHeadingFocus } from '../components/useHeadingFocus'
import { WoodPanel } from '../components/WoodPanel'
import { LogTable, type LogColumn, type LogView } from './LogTable'
import styles from './CaptainsLog.module.css'

type LogTab = 'ranking' | 'history'

type RankingRow = { rank: number; matchId: string; playerName: string; score: number; playedAt: string; isYou: boolean }
type HistoryRow = { matchId: string; playedAt: string; score: number; effectiveSec: number; endReason: 'timeUp' | 'defeated' }

const tabs: readonly TabItem<LogTab>[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
]

const rankingColumns: readonly LogColumn<RankingRow>[] = [
  { key: 'rank', label: 'Rank', cell: (row) => String(row.rank).padStart(2, '0') },
  { key: 'captain', label: 'Captain', cell: (row) => row.playerName },
  { key: 'points', label: 'Points', cell: (row) => row.score },
  { key: 'played', label: 'Played', cell: (row) => row.playedAt },
]

const historyColumns: readonly LogColumn<HistoryRow>[] = [
  { key: 'date', label: 'Date', cell: (row) => row.playedAt },
  { key: 'points', label: 'Points', cell: (row) => row.score },
  { key: 'duration', label: 'Duration', cell: (row) => row.effectiveSec },
  { key: 'result', label: 'Result', cell: (row) => (row.endReason === 'timeUp' ? "Time's up" : 'Defeated') },
]

const emptyView: LogView<never> = { rows: [], isFetching: false, isPlaceholder: false, error: null, page: 1, totalPages: 1 }

export function CaptainsLog() {
  const navigate = useNavigate()
  const headingRef = useHeadingFocus<HTMLHeadingElement>()
  const panelId = useId()
  const [searchParams, setSearchParams] = useSearchParams()
  const [options] = useState(loadOptions)
  const [player] = useState(loadPlayer)
  const tab: LogTab = searchParams.get('tab') === 'history' ? 'history' : 'ranking'
  const play = () => void navigate('/play')
  const noop = () => {}

  return (
    <MenuScene>
      <WoodPanel className={styles.panel}>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          Captain’s Log
        </h1>
        <Tabs
          label="Captain's log"
          tabs={tabs}
          active={tab}
          panelId={panelId}
          onSelect={(next) => setSearchParams({ tab: next }, { replace: true })}
        />
        <div id={panelId} role="tabpanel" aria-labelledby={tabId(panelId, tab)} className={styles.tabPanel}>
          {tab === 'ranking' ? (
            <>
              <p className={styles.caption}>
                {options.sessionSeconds} second battles · {options.spawnIntervalSec} second spawn interval
              </p>
              <LogTable
                caption="Ranking"
                columns={rankingColumns}
                view={emptyView}
                rowKey={(row) => row.matchId}
                highlight={(row) => row.isYou}
                emptyText="No battles logged yet for this configuration."
                onRetry={noop}
                onPage={noop}
                onPlay={play}
              />
            </>
          ) : (
            <>
              <p className={styles.caption}>{player.name} · your recent battles</p>
              <LogTable
                caption="Match history"
                columns={historyColumns}
                view={emptyView}
                rowKey={(row) => row.matchId}
                emptyText="No battles logged yet."
                onRetry={noop}
                onPage={noop}
                onPlay={play}
              />
            </>
          )}
        </div>
        <GoldButton className={styles.menu} onClick={() => void navigate('/')}>
          Main Menu
        </GoldButton>
      </WoodPanel>
    </MenuScene>
  )
}
