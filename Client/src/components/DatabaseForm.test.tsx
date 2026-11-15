import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, addDatabaseSources, listTables, type Database } from '../api'
import { DatabaseForm } from './DatabaseForm'

jest.mock('../api', () => ({ ...jest.requireActual('../api'), listTables: jest.fn(), addDatabaseSources: jest.fn() }))

const databases: Database[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    fields: [
      { name: 'host', label: 'Host', kind: 'Text', required: true, choices: null },
      { name: 'port', label: 'Port', kind: 'Number', required: false, choices: null },
      { name: 'password', label: 'Password', kind: 'Secret', required: false, choices: null },
      { name: 'tls', label: 'TLS', kind: 'Choice', required: false, choices: ['Disable', 'Require'] },
    ],
  },
  { id: 'mysql', name: 'MySQL', fields: [{ name: 'host', label: 'Host', kind: 'Text', required: true, choices: null }] },
]

function renderForm() {
  const onAdded = jest.fn()
  render(<DatabaseForm databases={databases} onAdded={onAdded} onCancel={jest.fn()} />)
  return { onAdded }
}

beforeEach(() => jest.clearAllMocks())

it("asks for the chosen database's own settings, masking a secret", async () => {
  renderForm()

  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  expect(screen.getByLabelText('Port')).toHaveAttribute('type', 'number')
  expect(screen.getByLabelText('TLS')).toHaveValue('')

  await userEvent.selectOptions(screen.getByLabelText('Database'), 'mysql')
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
})

it('lists the tables, then adds the ones picked under the names given them', async () => {
  jest.mocked(listTables).mockResolvedValue([
    { name: 'public.orders', columns: 4 },
    { name: 'public.customers', columns: 9 },
  ])
  jest.mocked(addDatabaseSources).mockResolvedValue([])
  const { onAdded } = renderForm()

  await userEvent.type(screen.getByLabelText('Host'), 'db.example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'pw')
  await userEvent.selectOptions(screen.getByLabelText('TLS'), 'Require')
  await userEvent.click(screen.getByRole('button', { name: 'List tables' }))

  expect(listTables).toHaveBeenCalledWith('postgres', { host: 'db.example.com', port: null, password: 'pw', tls: 'Require' })
  await userEvent.click(await screen.findByLabelText('public.orders'))
  expect(screen.getByLabelText('Source name for public.orders')).toHaveValue('public_orders')
  await userEvent.clear(screen.getByLabelText('Source name for public.orders'))
  await userEvent.type(screen.getByLabelText('Source name for public.orders'), 'orders')
  await userEvent.click(screen.getByRole('button', { name: 'Add 1 source' }))

  expect(addDatabaseSources).toHaveBeenCalledWith('postgres', expect.objectContaining({ host: 'db.example.com' }), [
    { table: 'public.orders', name: 'orders' },
  ])
  expect(onAdded).toHaveBeenCalledWith([])
})

it("says why it could not connect, and forgets listed tables once a setting changes", async () => {
  jest.mocked(listTables).mockRejectedValueOnce(new ApiError(400, 'Password authentication failed.'))
  jest.mocked(listTables).mockResolvedValueOnce([{ name: 'public.orders', columns: 4 }])
  renderForm()
  await userEvent.type(screen.getByLabelText('Host'), 'db')

  await userEvent.click(screen.getByRole('button', { name: 'List tables' }))
  expect(await screen.findByText('Password authentication failed.')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'List tables' }))
  expect(await screen.findByLabelText('public.orders')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Host'), 'x')
  expect(screen.queryByLabelText('public.orders')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'List tables' })).toBeInTheDocument()
})
