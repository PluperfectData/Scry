import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { canRequestFullscreen, enterFullscreen, useFullscreen } from '../fullscreen'
import { useTheme } from '../theme'
import { BrandMark } from './BrandMark'
import { NoticeStack } from './NoticeStack'
import { Tooltip } from './Tooltip'

const NAV = [
  { to: '/dashboards', label: 'Dashboards' },
  { to: '/sources', label: 'Sources' },
  { to: '/settings', label: 'Settings' },
  { to: '/docs', label: 'Docs' },
]

/** Shows the theme a press switches to: a sun for light, a moon for dark. */
function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <Tooltip label={label}>
      <button type="button" className="icon-button" onClick={toggle} aria-label={label}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {theme === 'dark' ? (
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </g>
          ) : (
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="currentColor" />
          )}
        </svg>
      </button>
    </Tooltip>
  )
}

/** Asks the browser to show the page in full screen. Escape, or the browser's own key, leaves it. */
function FullscreenButton() {
  return (
    <Tooltip label="Full screen">
      <button type="button" className="icon-button" onClick={enterFullscreen} aria-label="Full screen">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </Tooltip>
  )
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const fullscreen = useFullscreen()
  const onDashboard = /^\/dashboards\/[^/]+$/.test(pathname)
  // A dashboard in full screen shows only its name and charts, so the header and its banners go.
  const presenting = fullscreen && onDashboard
  // The installer comes before every other page, so the header offers none of them.
  const installing = pathname === '/install'

  // Navigating with the menu open leaves it covering the page it just went to.
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>

      {!presenting && (
        <div className="site-top">
          <header className="site-header">
            <div className="wrap">
              <NavLink to="/" className="brand">
                <BrandMark />
                Scry
              </NavLink>

              {!installing && (
                <nav className="nav" id="site-nav" aria-label="Main" data-open={menuOpen ? '' : undefined}>
                  {NAV.map((item) => (
                    <NavLink key={item.to} to={item.to} end className={({ isActive }) => (isActive ? 'is-active' : '')}>
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              )}

              <div className="header-actions">
                {onDashboard && canRequestFullscreen() && <FullscreenButton />}
                <ThemeToggle />

                {!installing && (
                  <Tooltip label={menuOpen ? 'Close menu' : 'Open menu'}>
                    <button
                      type="button"
                      className="icon-button nav-toggle"
                      onClick={() => setMenuOpen((open) => !open)}
                      aria-expanded={menuOpen}
                      aria-controls="site-nav"
                    >
                      <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d={menuOpen ? 'M5 5l14 14M19 5L5 19' : 'M4 7h16M4 12h16M4 17h16'}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          </header>

          <NoticeStack />
        </div>
      )}

      <main id="main">
        <Outlet />
      </main>
    </>
  )
}
