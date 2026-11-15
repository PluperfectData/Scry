import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_SECONDS, NoticeContext, type Notice, type NoticeOptions } from './notices'

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const count = useRef(0)

  const notify = useCallback((message: string, { tone = 'info', seconds = DEFAULT_SECONDS, id }: NoticeOptions = {}) => {
    const shown = ++count.current
    const notice: Notice = { id: id ?? `notice-${shown}`, shown, message, tone, seconds }
    setNotices((current) =>
      current.some((n) => n.id === notice.id)
        ? current.map((n) => (n.id === notice.id ? notice : n))
        : [...current, notice],
    )
    return notice.id
  }, [])

  const dismiss = useCallback((id: string) => setNotices((current) => current.filter((n) => n.id !== id)), [])

  const value = useMemo(() => ({ notices, notify, dismiss }), [notices, notify, dismiss])
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>
}
