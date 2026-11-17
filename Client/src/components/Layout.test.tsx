import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { type Me, signOut } from '../api'
import { peekNext } from '../next'
import { SessionContext, SIGNED_OUT } from '../session'
import { ThemeProvider } from '../ThemeProvider'
import { Layout, RequireSession } from './Layout'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
const { navigate, routerState } = jest.requireActual('../../jest/router')

jest.mock('../api', () => ({ ...jest.requireActual('../api'), signOut: jest.fn().mockResolvedValue(undefined) }))

const member: Me = { signedIn: true, id: 2, email: 'member@acme.test', isAdmin: false, hasPassword: true }

function SignedIn({ children, me = member, setMe = jest.fn() }: { children: ReactNode; me?: Me | null; setMe?: (me: Me) => void }) {
  return <SessionContext.Provider value={{ me, setMe }}>{children}</SessionContext.Provider>
}

beforeEach(() => jest.clearAllMocks())

it('opens and closes the menu from the button, which says what pressing it will do', async () => {
  routerState.pathname = '/'
  render(<SignedIn><Layout /></SignedIn>)
  const toggle = screen.getByRole('button', { name: 'Open menu' })

  await userEvent.click(toggle)

  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(toggle).toHaveAccessibleName('Close menu')
  expect(screen.getByRole('navigation', { name: 'Main' })).toHaveAttribute('data-open')
})

it('closes the menu after navigating', async () => {
  routerState.pathname = '/'
  const { rerender } = render(<SignedIn><Layout /></SignedIn>)
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))

  routerState.pathname = '/sources'
  rerender(<SignedIn><Layout /></SignedIn>)

  expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveAttribute('data-open')
})

it('offers no other page from the installer, and keeps the theme toggle', () => {
  routerState.pathname = '/install'
  render(<SignedIn><Layout /></SignedIn>)

  expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
})

it('starts light, switches to dark from the header, and remembers the choice', async () => {
  localStorage.clear()
  routerState.pathname = '/'
  render(
    <ThemeProvider>
      <SignedIn><Layout /></SignedIn>
    </ThemeProvider>,
  )
  expect(document.documentElement.dataset.theme).toBe('light')

  await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))

  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('scry-theme')).toBe('dark')
  expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()
})

describe('full screen', () => {
  const requestFullscreen = jest.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    requestFullscreen.mockClear()
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: requestFullscreen })
  })

  afterEach(() => {
    delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled
    delete (document as { fullscreenElement?: Element | null }).fullscreenElement
  })

  it('offers full screen beside the theme toggle on a dashboard, and asks the browser for it', async () => {
    routerState.pathname = '/dashboards/3'
    render(<SignedIn><Layout /></SignedIn>)

    await userEvent.click(screen.getByRole('button', { name: 'Full screen' }))

    expect(requestFullscreen).toHaveBeenCalled()
  })

  it('offers no full screen away from a dashboard', () => {
    routerState.pathname = '/sources'
    render(<SignedIn><Layout /></SignedIn>)

    expect(screen.queryByRole('button', { name: 'Full screen' })).not.toBeInTheDocument()
  })

  it('hides the header on a dashboard once the window is in full screen', () => {
    routerState.pathname = '/dashboards/3'
    render(<SignedIn><Layout /></SignedIn>)
    expect(screen.getByRole('banner')).toBeInTheDocument()

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})

it('offers no pages and no account to someone signed out', () => {
  routerState.pathname = '/sign-in'
  render(
    <SignedIn me={SIGNED_OUT}>
      <Layout />
    </SignedIn>,
  )

  expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Account menu/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
})

it('names the user on the account button, and offers Users to an admin alone', async () => {
  routerState.pathname = '/'
  const { unmount } = render(
    <SignedIn>
      <Layout />
    </SignedIn>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Account menu for member@acme.test, Member' }))
  const menu = screen.getByRole('menu', { name: 'Account' })
  expect(within(menu).getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', '/account')
  expect(within(menu).queryByRole('menuitem', { name: 'Users' })).not.toBeInTheDocument()
  unmount()

  render(
    <SignedIn me={{ ...member, isAdmin: true }}>
      <Layout />
    </SignedIn>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Account menu for member@acme.test, Admin' }))
  expect(within(screen.getByRole('menu', { name: 'Account' })).getByRole('menuitem', { name: 'Users' })).toHaveAttribute('href', '/users')
})

it('signs out from the account menu and goes to sign in', async () => {
  routerState.pathname = '/'
  const setMe = jest.fn()
  render(
    <SignedIn setMe={setMe}>
      <Layout />
    </SignedIn>,
  )

  await userEvent.click(screen.getByRole('button', { name: /Account menu/ }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))

  expect(signOut).toHaveBeenCalled()
  expect(setMe).toHaveBeenCalledWith(SIGNED_OUT)
  expect(navigate).toHaveBeenCalledWith('/sign-in')
})

it('sends someone signed out to sign in, and remembers where they were going', () => {
  routerState.pathname = '/dashboards/3'
  render(
    <SignedIn me={SIGNED_OUT}>
      <RequireSession />
    </SignedIn>,
  )

  expect(navigate).toHaveBeenCalledWith('/sign-in')
  expect(peekNext()).toBe('/dashboards/3')
})

it('waits to learn who is signed in before showing a page', () => {
  render(
    <SignedIn me={null}>
      <RequireSession />
    </SignedIn>,
  )

  expect(screen.getByText('Loading…')).toBeInTheDocument()
  expect(navigate).not.toHaveBeenCalled()
})
