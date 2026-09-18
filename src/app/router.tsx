import { createBrowserRouter, Navigate } from 'react-router'
import { Placeholder } from '../ui/screens/Placeholder'

export const router = createBrowserRouter([
  { path: '/', element: <Placeholder name="Menu" /> },
  { path: '/options', element: <Placeholder name="Options" /> },
  { path: '/play', element: <Placeholder name="Play" /> },
  { path: '/result', element: <Placeholder name="Result" /> },
  { path: '/log', element: <Placeholder name="Captain's Log" /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
