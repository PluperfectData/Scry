import { useEffect, useState } from 'react'

// A window in full screen by its own key, such as F11, matches this; one put there by a page has a fullscreenElement.
const WINDOW_FULLSCREEN = '(display-mode: fullscreen)'

const isFullscreen = () => document.fullscreenElement != null || (window.matchMedia?.(WINDOW_FULLSCREEN).matches ?? false)

/** Whether the window is in full screen, by the page's request or the browser's own. */
export function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(isFullscreen)

  useEffect(() => {
    const update = () => setFullscreen(isFullscreen())
    const media = window.matchMedia?.(WINDOW_FULLSCREEN)
    document.addEventListener('fullscreenchange', update)
    media?.addEventListener('change', update)
    return () => {
      document.removeEventListener('fullscreenchange', update)
      media?.removeEventListener('change', update)
    }
  }, [])

  return fullscreen
}

/** Whether the browser lets a page ask for full screen. iPhone Safari does not. */
export const canRequestFullscreen = () => document.fullscreenEnabled === true

export function enterFullscreen() {
  void document.documentElement.requestFullscreen().catch(() => {})
}
