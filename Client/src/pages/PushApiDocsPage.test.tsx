import { render, screen } from '@testing-library/react'
import { apiUrl } from '../api'
import { PushApiDocsPage } from './PushApiDocsPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())

it('shows each route at this Scry address, and links to Settings for a key', () => {
  render(<PushApiDocsPage />)

  for (const route of ['PUT', 'POST'].flatMap((method) => screen.getAllByText(new RegExp(`^${method} `)))) {
    expect(route.textContent).toContain(`${apiUrl}/ingest/sources/orders`)
  }
  expect(screen.getAllByText(/^(PUT|POST) /)).toHaveLength(4)
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  expect(screen.getByRole('heading', { name: 'Column types' })).toBeInTheDocument()
})
