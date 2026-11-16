import { render, screen } from '@testing-library/react'
import { getSeries } from '../api'
import type { Widget } from '../dashboard'
import { ChartWidget } from './ChartWidget'

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
