import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useTheme } from '../theme'

const NAV = [
  { to: '/', label: 'Dashboards' },
  { to: '/sources', label: 'Sources' },
]

/** Shows the theme a press switches to: a sun for light, a moon for dark. */
function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button type="button" className="icon-button" onClick={toggle} title={label} aria-label={label}>
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
  )
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  // Navigating with the menu open leaves it covering the page it just went to.
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="wrap">
          <NavLink to="/" className="brand">
            Scry
          </NavLink>

          <nav className="nav" id="site-nav" aria-label="Main" data-open={menuOpen ? '' : undefined}>
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end className={({ isActive }) => (isActive ? 'is-active' : '')}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <ThemeToggle />

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
          </div>
        </div>
      </header>

      <main id="main" className="page">
        <Outlet />
      </main>
    </>
  )
}
