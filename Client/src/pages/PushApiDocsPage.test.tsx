import { render, screen } from '@testing-library/react'
import { apiUrl } from '../api'
import { WorkspacesContext } from '../workspace'
import { PushApiDocsPage } from './PushApiDocsPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())

it("shows each route at this Scry address, and links to a workspace's Settings for a key", () => {
  const workspaces = [{ id: 4, name: 'Finance', role: 'Editor' as const, createdAt: '2026-11-16T00:00:00Z' }]
  render(
    <WorkspacesContext.Provider value={{ workspaces, error: null, refresh: jest.fn() }}>
      <PushApiDocsPage />
    </WorkspacesContext.Provider>,
  )

  for (const route of ['PUT', 'POST'].flatMap((method) => screen.getAllByText(new RegExp(`^${method} `)))) {
    expect(route.textContent).toContain(`${apiUrl}/ingest/sources/orders`)
  }
  expect(screen.getAllByText(/^(PUT|POST) /)).toHaveLength(4)
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/workspaces/4/settings')
  expect(screen.getByRole('heading', { name: 'Column types' })).toBeInTheDocument()
})
