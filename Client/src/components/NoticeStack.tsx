import { useEffect } from 'react'
import { useNotices, type Notice } from '../notices'
import { Tooltip } from './Tooltip'

function Banner({ notice, dismiss }: { notice: Notice; dismiss: (id: string) => void }) {
  const { id, message, tone, seconds } = notice

  useEffect(() => {
    if (seconds === null) return
    const timer = setTimeout(() => dismiss(id), seconds * 1000)
    return () => clearTimeout(timer)
  }, [id, seconds, dismiss])

  return (
    <div className="notice" data-tone={tone} role={tone === 'error' ? 'alert' : undefined}>
      <p className="notice-message">{message}</p>
      <Tooltip label="Dismiss">
        <button type="button" className="notice-close" onClick={() => dismiss(id)}>
          <span className="sr-only">Dismiss</span>
          {seconds !== null && (
            <svg className="notice-timer" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <circle cx="16" cy="16" r="14" pathLength={1} style={{ animationDuration: `${seconds}s` }} />
            </svg>
          )}
          <svg className="notice-x" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </Tooltip>
    </div>
  )
}

/** Banners stacked under the site header, oldest first. */
export function NoticeStack() {
  const { notices, dismiss } = useNotices()

  return (
    <div className="notices" aria-live="polite">
      {notices.map((notice) => (
        <Banner key={`${notice.id}-${notice.shown}`} notice={notice} dismiss={dismiss} />
      ))}
    </div>
  )
}
