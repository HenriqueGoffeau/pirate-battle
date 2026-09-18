import { Link } from 'react-router'

type PlaceholderProps = { name: string }

const routes = [
  { to: '/', label: 'Menu' },
  { to: '/options', label: 'Options' },
  { to: '/play', label: 'Play' },
  { to: '/result', label: 'Result' },
  { to: '/log', label: "Captain's Log" },
]

export function Placeholder({ name }: PlaceholderProps) {
  return (
    <main>
      <h1>Pirate Battle</h1>
      <p>{name}</p>
      <nav aria-label="Screens">
        <ul>
          {routes.map((route) => (
            <li key={route.to}>
              <Link to={route.to}>{route.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <footer>Build {import.meta.env.VITE_COMMIT_SHA ?? 'dev'}</footer>
    </main>
  )
}
