export const portraitQuery = '(orientation: portrait) and (pointer: coarse)'

export function isPlayBlocked(requireFocus: boolean): boolean {
  return document.hidden || (requireFocus && !document.hasFocus()) || window.matchMedia(portraitQuery).matches
}

export function attachAutoPause(onPause: () => void): () => void {
  const portrait = window.matchMedia(portraitQuery)
  const onBlur = () => onPause()
  const onVisibility = () => {
    if (document.hidden) onPause()
  }
  const onOrientation = (event: MediaQueryListEvent) => {
    if (event.matches) onPause()
  }
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
  portrait.addEventListener('change', onOrientation)
  return () => {
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('visibilitychange', onVisibility)
    portrait.removeEventListener('change', onOrientation)
  }
}
