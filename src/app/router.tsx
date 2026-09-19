import { createBrowserRouter, Navigate } from 'react-router'
import { GameRoute } from '../ui/game/GameRoute'
import { Placeholder } from '../ui/screens/Placeholder'

export const router = createBrowserRouter([
  { path: '/', element: <Placeholder name="Menu" /> },
  { path: '/options', element: <Placeholder name="Options" /> },
  {
    element: <GameRoute />,
    children: [
      { path: '/play', element: null },
      { path: '/result', element: null },
    ],
  },
  { path: '/log', element: <Placeholder name="Captain's Log" /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
