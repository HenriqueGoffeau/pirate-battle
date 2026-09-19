import { createBrowserRouter, Navigate } from 'react-router'
import { GameRoute } from '../ui/game/GameRoute'
import { CaptainsLog } from '../ui/screens/CaptainsLog'
import { Menu } from '../ui/screens/Menu'
import { Options } from '../ui/screens/Options'

export const router = createBrowserRouter([
  { path: '/', element: <Menu /> },
  { path: '/options', element: <Options /> },
  {
    element: <GameRoute />,
    children: [
      { path: '/play', element: null },
      { path: '/result', element: null },
    ],
  },
  { path: '/log', element: <CaptainsLog /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
