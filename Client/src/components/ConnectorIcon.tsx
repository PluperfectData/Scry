import type { ReactNode } from 'react'

type Kind = 'file' | 'api' | 'database' | 'broker'

const KINDS: Record<string, Kind> = {
  csv: 'file',
  push: 'api',
  nexus: 'api',
  mysql: 'database',
  postgres: 'database',
  sqlserver: 'database',
  schwab: 'broker',
}

const DRAWINGS: Record<Kind, ReactNode> = {
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M8.5 13h7M8.5 17h7M12 13v4" />
    </>
  ),
  api: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" />
    </>
  ),
  broker: (
    <>
      <path d="M6 3v3M6 14v7M12 4v4M12 16v4M18 7v3M18 17v3" />
      <rect x="4" y="6" width="4" height="8" rx="1" />
      <rect x="10" y="8" width="4" height="8" rx="1" />
      <rect x="16" y="10" width="4" height="7" rx="1" />
    </>
  ),
}

/** A connector's line icon, on the tint its kind shares: files, databases, or brokers. */
export function ConnectorIcon({ id }: { id: string }) {
  const kind = KINDS[id] ?? 'database'
  return (
    <span className="connector-icon" data-kind={kind}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {DRAWINGS[kind]}
        </g>
      </svg>
    </span>
  )
}
