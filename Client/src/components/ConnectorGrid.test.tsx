import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Connector } from '../api'
import { ConnectorGrid } from './ConnectorGrid'

const connectors: Connector[] = [
  { id: 'csv', name: 'CSV', description: 'Reads a delimited text file.', fields: [] },
  { id: 'postgres', name: 'PostgreSQL', description: 'Reads tables from a PostgreSQL database.', fields: [] },
  { id: 'schwab', name: 'Charles Schwab', description: 'Reads a Schwab sign-in.', fields: [] },
]

it('shows each connector with its description, on the tint of its kind', () => {
  render(<ConnectorGrid connectors={connectors} onPick={jest.fn()} />)

  const tiles = screen.getAllByRole('button')
  expect(tiles.map((tile) => tile.textContent)).toEqual([
    'CSVReads a delimited text file.',
    'PostgreSQLReads tables from a PostgreSQL database.',
    'Charles SchwabReads a Schwab sign-in.',
  ])
  expect(tiles.map((tile) => tile.querySelector('.connector-icon')?.getAttribute('data-kind'))).toEqual([
    'file',
    'database',
    'broker',
  ])
})

it('picks the connector whose tile is pressed', async () => {
  const onPick = jest.fn()
  render(<ConnectorGrid connectors={connectors} onPick={onPick} />)

  await userEvent.click(screen.getByRole('button', { name: /PostgreSQL/ }))

  expect(onPick).toHaveBeenCalledWith(connectors[1])
})
