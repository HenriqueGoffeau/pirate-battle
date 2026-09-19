const pad = (value: number) => String(value).padStart(2, '0')

export const formatClock = (totalSeconds: number) => `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`
