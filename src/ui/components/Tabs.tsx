import { useRef, type KeyboardEvent } from 'react'
import { GoldButton } from './GoldButton'
import { tabId } from './tabId'
import styles from './Tabs.module.css'

export type TabItem<T extends string> = { id: T; label: string }

type TabsProps<T extends string> = {
  label: string
  tabs: readonly TabItem<T>[]
  active: T
  panelId: string
  onSelect(id: T): void
}

export function Tabs<T extends string>({ label, tabs, active, panelId, onSelect }: TabsProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }
    if (!(event.key in moves)) return
    event.preventDefault()
    const next = (moves[event.key] + tabs.length) % tabs.length
    onSelect(tabs[next].id)
    buttons.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={styles.tabs}>
      {tabs.map((tab, index) => {
        const selected = tab.id === active
        return (
          <GoldButton
            key={tab.id}
            ref={(element) => {
              buttons.current[index] = element
            }}
            role="tab"
            id={tabId(panelId, tab.id)}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            variant={selected ? 'primary' : 'secondary'}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </GoldButton>
        )
      })}
    </div>
  )
}
