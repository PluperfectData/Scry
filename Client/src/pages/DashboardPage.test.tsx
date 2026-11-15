import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, editDashboard, getDashboard, listSources, saveDashboard, type Dashboard, type Source } from '../api'
import type { Widget } from '../dashboard'
import { DashboardPage } from './DashboardPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
const { routerState } = jest.requireActual('../../jest/router')

const mockNotify = jest.fn()
jest.mock('../notices', () => ({ useNotices: () => ({ notify: mockNotify }) }))

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  editDashboard: jest.fn(),
  getDashboard: jest.fn(),
  listSources: jest.fn(),
  saveDashboard: jest.fn(),
}))

jest.mock('react-grid-layout', () => ({
  Responsive: ({ children }: { children: unknown }) => children,
  useContainerWidth: () => ({ width: 1200, containerRef: { current: null }, mounted: true }),
}))

// A chart is a button that opens it for editing, when the page offers that.
jest.mock('../components/ChartWidget', () => ({
  ChartWidget: ({ widget, onEdit }: { widget: Widget; onEdit?: () => void }) =>
    onEdit ? jest.requireActual('react').createElement('button', { type: 'button', onClick: onEdit }, `Edit ${widget.title}`) : widget.title,
}))

// The form saves a bar chart when adding, and switches the chart it edits to its maximum.
jest.mock('../components/ChartForm', () => ({
  ChartForm: ({ widget, onSave }: { widget: Widget | null; onSave: (settings: unknown) => void }) => {
    const { id: _id, title: _title, ...settings } = widget ?? { id: '', title: '' }
    const saved = widget
      ? { ...settings, aggregate: 'max' }
      : { kind: 'bar', sourceId: 7, join: null, name: null, scales: null, x: 'day', y: 'amount', aggregate: 'sum' }
    return jest.requireActual('react').createElement('button', { type: 'button', onClick: () => onSave(saved) }, 'Save the form')
  },
}))

/// The form is its own unit; here it saves a new name, makes the dashboard the landing page, and speeds it up.
const mockFast = { showTitle: true, scroll: true, wrap: 'loop', pace: 'fast', seconds: 8 }
jest.mock('../components/DashboardForm', () => ({
  DashboardForm: ({ onSave }: { onSave: (name: string, isLanding: boolean, presentation: unknown) => void }) =>
    jest
      .requireActual('react')
      .createElement('button', { type: 'button', onClick: () => onSave('Sales 2026', true, mockFast) }, 'Save the dashboard'),
}))

const orders: Source = {
  id: 7,
  name: 'orders',
  kind: 'Upload',
  pushedBy: null,
  fileName: 'orders.csv',
  connector: null,
  stream: null,
  columns: [{ name: 'day', type: 'Date' }, { name: 'amount', type: 'Int64' }],
  rowCount: 3,
  syncedAt: '2026-11-13T12:00:00Z',
  status: 'Ready',
  error: null,
}

const sales = (widgets: Widget[], layouts: Dashboard['layouts']): Dashboard => ({
  id: 3,
  name: 'Sales',
  layouts,
  widgets,
  isLanding: false,
  presentation: null,
  createdAt: '2026-11-13T12:00:00Z',
  updatedAt: '2026-11-13T12:00:00Z',
})

const byDay: Widget = { id: 'w1', title: 'Sum of amount by day', kind: 'bar', sourceId: 7, join: null, name: null, scales: null, x: 'day', y: 'amount', aggregate: 'sum' }

beforeEach(() => {
  jest.clearAllMocks()
  routerState.params = { id: '3' }
  jest.mocked(listSources).mockResolvedValue([orders])
  jest.mocked(saveDashboard).mockImplementation(async (dashboard) => ({ ...sales([], {}), ...dashboard }))
})

it('adds a chart from the slideout, below everything else in every layout', async () => {
  jest.mocked(getDashboard).mockResolvedValue(sales([], {}))
  render(<DashboardPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Add chart' }))
  expect(screen.getByRole('dialog', { name: 'Add a chart' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save the form' }))

  expect(screen.queryByRole('button', { name: 'Save the form' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit Sum of amount by day' })).toBeInTheDocument()
  await waitFor(() => expect(saveDashboard).toHaveBeenCalled())
  const saved = jest.mocked(saveDashboard).mock.calls[0][0]
  expect(saved.widgets).toEqual([{ ...byDay, id: expect.any(String) }])
  expect(saved.layouts.lg).toEqual([{ i: saved.widgets[0].id, x: 0, y: 0, w: 6, h: 7 }])
})

it('edits a chart in place, keeping its id and its place on the grid', async () => {
  const layouts = { lg: [{ i: 'w1', x: 4, y: 2, w: 6, h: 7 }] }
  jest.mocked(getDashboard).mockResolvedValue(sales([byDay], layouts))
  render(<DashboardPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Edit Sum of amount by day' }))
  expect(screen.getByRole('dialog', { name: 'Edit chart' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save the form' }))

  expect(screen.getByRole('button', { name: 'Edit Maximum of amount by day' })).toBeInTheDocument()
  await waitFor(() => expect(saveDashboard).toHaveBeenCalled())
  expect(jest.mocked(saveDashboard).mock.calls[0][0]).toMatchObject({
    widgets: [{ ...byDay, title: 'Maximum of amount by day', aggregate: 'max' }],
    layouts,
  })
})

it('reports each save in a banner: Saved for the default time, or an error that stays until closed', async () => {
  jest.mocked(getDashboard).mockResolvedValue(sales([byDay], {}))
  render(<DashboardPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Edit Sum of amount by day' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save the form' }))
  await waitFor(() =>
    expect(mockNotify).toHaveBeenCalledWith('Saved', { tone: 'success', id: 'dashboard-save' }),
  )

  jest.mocked(saveDashboard).mockRejectedValue(new ApiError(500, 'The database is down.'))
  await userEvent.click(screen.getByRole('button', { name: 'Edit Maximum of amount by day' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save the form' }))
  await waitFor(() =>
    expect(mockNotify).toHaveBeenLastCalledWith('Not saved: The database is down.', {
      tone: 'error',
      seconds: null,
      id: 'dashboard-save',
    }),
  )
})

it('offers no chart to add or edit until there is a source', async () => {
  jest.mocked(listSources).mockResolvedValue([])
  jest.mocked(getDashboard).mockResolvedValue(sales([byDay], {}))
  render(<DashboardPage />)

  expect(await screen.findByRole('link', { name: 'Upload a CSV file' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add chart' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit Sum of amount by day' })).not.toBeInTheDocument()
})

it('renames the dashboard from the pencil beside its name, saving it on its own', async () => {
  jest.mocked(getDashboard).mockResolvedValue(sales([], {}))
  jest.mocked(editDashboard).mockResolvedValue({ ...sales([], {}), name: 'Sales 2026', isLanding: true })
  render(<DashboardPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Edit Sales' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit dashboard' })).getByRole('button', { name: 'Save the dashboard' }))

  expect(editDashboard).toHaveBeenCalledWith(3, 'Sales 2026', true, mockFast)
  expect(await screen.findByRole('heading', { level: 1, name: 'Sales 2026' })).toBeInTheDocument()
  expect(saveDashboard).not.toHaveBeenCalled()
})

it('is read only in full screen: the name and charts, with nothing to add, rename, or edit', async () => {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement })
  try {
    jest.mocked(getDashboard).mockResolvedValue(sales([byDay], {}))
    render(<DashboardPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Sales' })).toBeInTheDocument()
    expect(screen.getByText('Sum of amount by day')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add chart' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Sales' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Sum of amount by day' })).not.toBeInTheDocument()
  } finally {
    delete (document as { fullscreenElement?: Element | null }).fullscreenElement
  }
})

it('shows only the charts in full screen when the dashboard hides its title', async () => {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement })
  try {
    jest.mocked(getDashboard).mockResolvedValue({
      ...sales([byDay], {}),
      presentation: { showTitle: false, scroll: true, wrap: 'loop', pace: 'medium', seconds: 15 },
    })
    render(<DashboardPage />)

    expect(await screen.findByText('Sum of amount by day')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  } finally {
    delete (document as { fullscreenElement?: Element | null }).fullscreenElement
  }
})
