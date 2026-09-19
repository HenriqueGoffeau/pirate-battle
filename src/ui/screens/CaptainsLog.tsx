import { useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { configKey } from '../../config/matchConfig'
import type { UserOptions } from '../../config/userOptions'
import type { MatchRecord, RankingEntry } from '../../data/contracts/types'
import { loadOptions, loadPlayer, type PlayerProfile } from '../../data/local'
import { useHistory, useRanking } from '../../data/queries'
import { formatClock, formatPlayedAt } from '../../shared/format'
import { GoldButton } from '../components/GoldButton'
import { MenuScene } from '../components/MenuScene'
import { tabId } from '../components/tabId'
import { Tabs, type TabItem } from '../components/Tabs'
import { useHeadingFocus } from '../components/useHeadingFocus'
import { WoodPanel } from '../components/WoodPanel'
import { LogTable, type LogColumn } from './LogTable'
import { toLogView } from './logView'
import styles from './CaptainsLog.module.css'

type LogTab = 'ranking' | 'history'

const tabs: readonly TabItem<LogTab>[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
]

const PlayedAt = ({ iso }: { iso: string }) => <time dateTime={iso}>{formatPlayedAt(iso)}</time>

const rankingColumns: readonly LogColumn<RankingEntry>[] = [
  {
    key: 'rank',
    label: 'Rank',
    className: styles.rank,
    cell: (row) => (
      <>
        {String(row.rank).padStart(2, '0')}
        {row.rank === 1 && <span className={styles.star} aria-hidden="true" />}
      </>
    ),
  },
  {
    key: 'captain',
    label: 'Captain',
    className: styles.captain,
    cell: (row) => (
      <>
        {row.playerName}
        {row.isYou && <span className={styles.you}>You</span>}
      </>
    ),
  },
  { key: 'points', label: 'Points', className: styles.points, cell: (row) => row.score },
  { key: 'played', label: 'Played', cell: (row) => <PlayedAt iso={row.playedAt} /> },
]

const historyColumns: readonly LogColumn<MatchRecord>[] = [
  { key: 'date', label: 'Date', cell: (row) => <PlayedAt iso={row.playedAt} /> },
  { key: 'points', label: 'Points', className: styles.points, cell: (row) => row.score },
  {
    key: 'duration',
    label: 'Duration',
    cell: (row) => <time dateTime={`PT${row.effectiveSec}S`}>{formatClock(row.effectiveSec)}</time>,
  },
  {
    key: 'result',
    label: 'Result',
    cell: (row) => (
      <>
        <span className={row.endReason === 'timeUp' ? styles.survived : styles.defeated}>
          {row.endReason === 'timeUp' ? "Time's up" : 'Defeated'}
        </span>
        {row.custom && <span className={styles.custom}>Custom</span>}
      </>
    ),
  },
]

type PanelProps = { onPlay(): void }

function RankingPanel({ options, onPlay }: PanelProps & { options: UserOptions }) {
  const [page, setPage] = useState(1)
  const query = useRanking(configKey(options), page)
  return (
    <>
      <p className={styles.caption}>
        {options.sessionSeconds} second battles · {options.spawnIntervalSec} second spawn interval
      </p>
      <LogTable
        caption="Ranking"
        columns={rankingColumns}
        view={toLogView(query, page, 'the ranking')}
        rowKey={(row) => row.matchId}
        highlight={(row) => row.isYou}
        emptyText="No battles logged yet for this configuration."
        onRetry={() => void query.refetch()}
        onPage={setPage}
        onPlay={onPlay}
      />
    </>
  )
}

function HistoryPanel({ player, onPlay }: PanelProps & { player: PlayerProfile }) {
  const [page, setPage] = useState(1)
  const query = useHistory(player.playerId, page)
  const view = toLogView(query, page, 'your match history')
  const newest = view.page === 1 && !view.isPlaceholder ? view.rows?.[0]?.matchId : undefined
  return (
    <>
      <p className={styles.caption}>{player.name} · your recent battles</p>
      <LogTable
        caption="Match history"
        columns={historyColumns}
        view={view}
        rowKey={(row) => row.matchId}
        highlight={(row) => row.matchId === newest}
        emptyText="No battles logged yet."
        onRetry={() => void query.refetch()}
        onPage={setPage}
        onPlay={onPlay}
      />
    </>
  )
}

export function CaptainsLog() {
  const navigate = useNavigate()
  const headingRef = useHeadingFocus<HTMLHeadingElement>()
  const panelId = useId()
  const [searchParams, setSearchParams] = useSearchParams()
  const [options] = useState(loadOptions)
  const [player] = useState(loadPlayer)
  const tab: LogTab = searchParams.get('tab') === 'history' ? 'history' : 'ranking'
  const play = () => void navigate('/play')

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
            <RankingPanel options={options} onPlay={play} />
          ) : (
            <HistoryPanel player={player} onPlay={play} />
          )}
        </div>
        <GoldButton className={styles.menu} onClick={() => void navigate('/')}>
          Main Menu
        </GoldButton>
      </WoodPanel>
    </MenuScene>
  )
}
