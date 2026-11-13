import { render, screen } from '@testing-library/react'
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
