import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '../ThemeProvider'
import { Layout } from './Layout'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
const { routerState } = jest.requireActual('../../jest/router')

it('opens and closes the menu from the button, which says what pressing it will do', async () => {
  routerState.pathname = '/'
  render(<Layout />)
  const toggle = screen.getByRole('button', { name: 'Open menu' })

  await userEvent.click(toggle)

  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(toggle).toHaveAccessibleName('Close menu')
  expect(screen.getByRole('navigation', { name: 'Main' })).toHaveAttribute('data-open')
})

it('closes the menu after navigating', async () => {
  routerState.pathname = '/'
  const { rerender } = render(<Layout />)
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))

  routerState.pathname = '/sources'
  rerender(<Layout />)

  expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveAttribute('data-open')
})

it('starts light, switches to dark from the header, and remembers the choice', async () => {
  localStorage.clear()
  routerState.pathname = '/'
  render(
    <ThemeProvider>
      <Layout />
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
    render(<Layout />)

    await userEvent.click(screen.getByRole('button', { name: 'Full screen' }))

    expect(requestFullscreen).toHaveBeenCalled()
  })

  it('offers no full screen away from a dashboard', () => {
    routerState.pathname = '/sources'
    render(<Layout />)

    expect(screen.queryByRole('button', { name: 'Full screen' })).not.toBeInTheDocument()
  })

  it('hides the header on a dashboard once the window is in full screen', () => {
    routerState.pathname = '/dashboards/3'
    render(<Layout />)
    expect(screen.getByRole('banner')).toBeInTheDocument()

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})
