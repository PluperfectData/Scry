import { render, screen } from '@testing-library/react'
import { getSeries } from '../api'
import type { Widget } from '../dashboard'
import { ChartWidget } from './ChartWidget'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
jest.mock('../api', () => ({ ...jest.requireActual('../api'), getSeries: jest.fn() }))
jest.mock('./Chart', () => ({ Chart: () => null }))

const byDay: Widget = { id: 'w1', title: 'Sum of amount by day', kind: 'bar', sourceId: 7, join: null, name: null, scales: null, x: 'day', y: 'amount', aggregate: 'sum' }

it('says its source was removed, asks for another where it can be edited, and loads nothing', () => {
  render(<ChartWidget widget={byDay} sourceGone onEdit={jest.fn()} />)

  expect(screen.getByText('Its source was removed. Edit this chart to pick another.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit Sum of amount by day' })).toBeInTheDocument()
  expect(getSeries).not.toHaveBeenCalled()
})

it('only says its source was removed where it cannot be edited', () => {
  render(<ChartWidget widget={byDay} sourceGone />)

  expect(screen.getByText('Its source was removed.')).toBeInTheDocument()
})

it("notes that its data stopped updating, with a way to sign in again for an editor and a word for a viewer", () => {
  jest.mocked(getSeries).mockReturnValue(new Promise(() => {}))
  const text = 'This data was last updated Nov 18, 2026. Its Charles Schwab sign-in ended Nov 18, 2026.'
  const { unmount } = render(<ChartWidget widget={byDay} stale={{ text, sourcesPath: '/workspaces/1/sources' }} />)

  expect(screen.getByRole('link', { name: 'Sign in again on the Sources page.' })).toHaveAttribute('href', '/workspaces/1/sources')
  expect(screen.getByText(text, { exact: false }).closest('p')).toHaveClass('stale-note')
  unmount()

  render(<ChartWidget widget={byDay} stale={{ text, sourcesPath: null }} />)
  expect(screen.getByText(`${text} An editor can sign in again.`)).toBeInTheDocument()
})
