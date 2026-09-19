import { useId } from 'react'
import { useNavigate } from 'react-router'
import { actionLabels, keyLabel, keysFor, type Action } from '../../shared/bindings'
import { GoldButton } from '../components/GoldButton'
import { MenuScene } from '../components/MenuScene'
import { useHeadingFocus } from '../components/useHeadingFocus'
import { WoodPanel } from '../components/WoodPanel'
import { CaptainName } from './CaptainName'
import styles from './Menu.module.css'

const controlRows: readonly Action[] = ['forward', 'turnLeft', 'turnRight', 'fireFront', 'fireLeft', 'fireRight', 'pause']

export function Menu() {
  const navigate = useNavigate()
  const headingRef = useHeadingFocus<HTMLHeadingElement>()
  const controlsId = useId()

  return (
    <MenuScene>
      <WoodPanel className={styles.panel}>
        <div className={styles.primary}>
          <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
            <span className="visually-hidden">Pirate Battle</span>
          </h1>
          <p className={styles.tagline}>Set sail. Take command.</p>
          <div className={styles.actions}>
            <GoldButton onClick={() => void navigate('/play')}>Play</GoldButton>
            <GoldButton onClick={() => void navigate('/options')}>Options</GoldButton>
          </div>
          <span className={styles.ship} aria-hidden="true" />
          <CaptainName />
          <p className={styles.motto}>Navigate the islands. Survive the battle.</p>
          <nav aria-label="Captain's log" className={styles.log}>
            <GoldButton variant="secondary" onClick={() => void navigate('/log?tab=ranking')}>
              Ranking
            </GoldButton>
            <GoldButton variant="secondary" onClick={() => void navigate('/log?tab=history')}>
              Match History
            </GoldButton>
          </nav>
        </div>
        <section aria-labelledby={controlsId} className={styles.controls}>
          <h2 id={controlsId} className={styles.controlsTitle}>
            Controls
          </h2>
          <table className={styles.table}>
            <thead className="visually-hidden">
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Keys</th>
              </tr>
            </thead>
            <tbody>
              {controlRows.map((action) => (
                <tr key={action}>
                  <th scope="row">{actionLabels[action]}</th>
                  <td>
                    {keysFor(action).map((code) => (
                      <kbd key={code}>{keyLabel(code)}</kbd>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.touchNote}>On a touch screen, use the round buttons in the bottom corners.</p>
        </section>
      </WoodPanel>
    </MenuScene>
  )
}
