import { render, screen, within } from '@testing-library/react'
import { PivotView } from './PivotView'

it('lays each value out at its row and column places, with the shared column last as Other', () => {
  render(
    <PivotView
      rowLabel="day"
      series={{
        xType: 'category',
        truncated: false,
        points: [
          ['2026-01-02', 'east', 7, 2, 1],
          ['2026-01-01', 'east', 10, 1, 1],
          ['2026-01-01', null, 3.456, 1, 3],
          ['2026-01-01', 'west', 5, 1, 2],
        ],
      }}
    />,
  )

  expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['day', 'east', 'west', 'Other'])
  const [first, second] = screen.getAllByRole('row').slice(1)
  expect(within(first).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['10', '5', '3.46'])
  expect(within(second).getByRole('rowheader')).toHaveTextContent('2026-01-02')
  expect(within(second).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['7', '', ''])
})

it('says so when there are no rows', () => {
  render(<PivotView rowLabel="day" series={{ xType: 'category', truncated: false, points: [] }} />)

  expect(screen.getByText('No rows')).toBeInTheDocument()
})
