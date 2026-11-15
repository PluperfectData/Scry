import { createContext, useContext } from 'react'

export type Tone = 'info' | 'success' | 'warning' | 'error'

export const DEFAULT_SECONDS = 5

export interface NoticeOptions {
  tone?: Tone
  /** How long the banner shows before closing itself, 5 seconds unless given. Null keeps it until its × is pressed. */
  seconds?: number | null
  /** A later notice with the same id takes this one's place, so news that repeats shows once. */
  id?: string
}

export interface Notice {
  id: string
  /** Counts up each time a notice is shown, so a notice that takes another's place starts its timer again. */
  shown: number
  message: string
  tone: Tone
  seconds: number | null
}

export interface Notices {
  notices: Notice[]
  notify: (message: string, options?: NoticeOptions) => string
  dismiss: (id: string) => void
}

export const NoticeContext = createContext<Notices>({ notices: [], notify: () => '', dismiss: () => {} })

export const useNotices = () => useContext(NoticeContext)
