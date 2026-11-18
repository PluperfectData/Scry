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

it('says why a connector is not ready yet, and does not pick it', async () => {
  const onPick = jest.fn()
  const notReady = 'This workspace has no Charles Schwab app yet. Add it under Providers on the workspace page in Nexus.'
  render(<ConnectorGrid connectors={[{ ...connectors[2], notReady }]} onPick={onPick} />)

  const tile = screen.getByRole('button', { name: /Charles Schwab/ })
  await userEvent.click(tile)

  expect(tile).toBeDisabled()
  expect(tile).toHaveTextContent(notReady)
  expect(onPick).not.toHaveBeenCalled()
})

it('picks the connector whose tile is pressed', async () => {
  const onPick = jest.fn()
  render(<ConnectorGrid connectors={connectors} onPick={onPick} />)

  await userEvent.click(screen.getByRole('button', { name: /PostgreSQL/ }))

  expect(onPick).toHaveBeenCalledWith(connectors[1])
})
