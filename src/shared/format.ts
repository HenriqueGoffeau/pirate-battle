const pad = (value: number) => String(value).padStart(2, '0')

const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export const formatClock = (totalSeconds: number) => `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`

export function formatPlayedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${pad(date.getDate())} ${months[date.getMonth()]} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
