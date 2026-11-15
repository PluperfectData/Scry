import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createDashboard,
  deleteDashboard,
  editDashboard,
  listDashboards,
  type Dashboard,
  type DashboardSummary,
} from '../api'
import { DashboardsPage } from './DashboardsPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
const { navigate } = jest.requireActual('../../jest/router')

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listDashboards: jest.fn(),
  createDashboard: jest.fn(),
  editDashboard: jest.fn(),
  deleteDashboard: jest.fn(),
}))

// The form is its own unit; here it saves "Costs 2026", and when editing makes it the landing page.
jest.mock('../components/DashboardForm', () => ({
  DashboardForm: ({ offerLanding, onSave }: { offerLanding: boolean; onSave: (name: string, isLanding: boolean) => void }) =>
    jest
      .requireActual('react')
      .createElement(
        'button',
        { type: 'button', onClick: () => onSave('Costs 2026', offerLanding) },
        offerLanding ? 'Save the edit' : 'Save the new dashboard',
      ),
}))

const summary = (id: number, name: string, chartCount: number, isLanding = false): DashboardSummary => ({
  id,
  name,
  chartCount,
  isLanding,
  updatedAt: '2026-11-15T12:00:00Z',
})

const full = (id: number, name: string, isLanding: boolean): Dashboard => ({
  id,
  name,
  layouts: {},
  widgets: [],
  isLanding,
  createdAt: '2026-11-15T12:00:00Z',
  updatedAt: '2026-11-15T12:00:00Z',
})

const costs = summary(2, 'Costs', 1)
const sales = summary(1, 'Sales', 3, true)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listDashboards).mockResolvedValue([costs, sales, summary(4, 'Zeros', 0)])
})

const card = (name: string) => screen.getByRole('heading', { name }).closest('li') as HTMLElement

it('lists each dashboard with its chart count, marking the landing page', async () => {
  render(<DashboardsPage />)

  await screen.findByRole('heading', { name: 'Costs' })
  expect(within(card('Costs')).getByText('1 chart')).toBeInTheDocument()
  expect(within(card('Sales')).getByText('3 charts · Landing page')).toBeInTheDocument()
  expect(within(card('Zeros')).getByText('No charts')).toBeInTheDocument()
  expect(navigate).not.toHaveBeenCalled()
})

it('opens the landing dashboard in place of the list, as the index', async () => {
  render(<DashboardsPage openLanding />)

  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboards/1', { replace: true }))
  expect(screen.queryByRole('heading', { name: 'Sales' })).not.toBeInTheDocument()
})

it('shows the list as the index when no dashboard is the landing page', async () => {
  jest.mocked(listDashboards).mockResolvedValue([costs])
  render(<DashboardsPage openLanding />)

  expect(await screen.findByRole('heading', { name: 'Costs' })).toBeInTheDocument()
  expect(navigate).not.toHaveBeenCalled()
})

it('adds a dashboard from the slideout and opens it', async () => {
  jest.mocked(createDashboard).mockResolvedValue(full(9, 'Costs 2026', false))
  render(<DashboardsPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Add dashboard' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Add a dashboard' })).getByRole('button', { name: 'Save the new dashboard' }))

  expect(createDashboard).toHaveBeenCalledWith('Costs 2026')
  expect(navigate).toHaveBeenCalledWith('/dashboards/9')
})

it('edits a dashboard from its pencil, moving the landing page to it', async () => {
  jest.mocked(editDashboard).mockResolvedValue(full(2, 'Costs 2026', true))
  render(<DashboardsPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Edit Costs' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit dashboard' })).getByRole('button', { name: 'Save the edit' }))

  expect(editDashboard).toHaveBeenCalledWith(2, 'Costs 2026', true)
  await screen.findByRole('heading', { name: 'Costs 2026' })
  expect(within(card('Costs 2026')).getByText('1 chart · Landing page')).toBeInTheDocument()
  expect(within(card('Sales')).getByText('3 charts')).toBeInTheDocument()
})

it('deletes a dashboard from its ×', async () => {
  jest.mocked(deleteDashboard).mockResolvedValue(undefined)
  render(<DashboardsPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Delete Sales' }))

  expect(deleteDashboard).toHaveBeenCalledWith(1)
  expect(screen.queryByRole('heading', { name: 'Sales' })).not.toBeInTheDocument()
})
