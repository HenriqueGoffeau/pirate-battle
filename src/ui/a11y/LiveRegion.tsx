import type { Ref } from 'react'

export function LiveRegion({ ref }: { ref: Ref<HTMLDivElement> }) {
  return <div ref={ref} className="visually-hidden" aria-live="polite" aria-atomic="true" />
}
