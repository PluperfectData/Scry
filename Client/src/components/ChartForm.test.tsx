import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Source } from '../api'
import { AUTO_SCALE, type Widget } from '../dashboard'
import { ChartForm } from './ChartForm'

const AUTO = { x: AUTO_SCALE, y: AUTO_SCALE }

const orders: Source = {
  id: 7,
  name: 'orders',
  kind: 'Upload',
  pushedBy: null,
  fileName: 'orders.csv',
  connector: null,
  stream: null,
  columns: [
    { name: 'day', type: 'Date' },
    { name: 'region', type: 'String' },
    { name: 'amount', type: 'Int64' },
  ],
  rowCount: 3,
  syncedAt: '2026-11-13T12:00:00Z',
  status: 'Ready',
  error: null,
}

const regions: Source = {
  id: 8,
  name: 'regions',
  kind: 'Upload',
  pushedBy: null,
  fileName: 'regions.csv',
  connector: null,
  stream: null,
  columns: [
    { name: 'code', type: 'String' },
    { name: 'name', type: 'String' },
  ],
  rowCount: 2,
  syncedAt: '2026-11-13T12:00:00Z',
  status: 'Ready',
  error: null,
}

const COMBINING = 'Sum adds them up, Average averages them, Minimum and Maximum keep the smallest or largest, and Count counts the rows.'

function renderForm(widget: Widget | null = null, sources = [orders]) {
  const onSave = jest.fn()
  const onCancel = jest.fn()
  render(<ChartForm sources={sources} widget={widget} onSave={onSave} onCancel={onCancel} />)
  return { onSave, onCancel }
}

const help = (term: string) => screen.getByRole('button', { name: `About ${term}` })

it('joins another source on a column pair, offering both sources’ columns by name', async () => {
  const { onSave } = renderForm(null, [orders, regions])

  await userEvent.selectOptions(screen.getByLabelText('Join'), 'regions')
  expect(screen.getByRole('button', { name: 'Add bar chart' })).toBeDisabled()
  await userEvent.selectOptions(screen.getByLabelText('Join on'), 'region')
  await userEvent.selectOptions(screen.getByLabelText('Equals'), 'code')
  const type = screen.getByLabelText('Join type')
  expect(within(type).getAllByRole('option').map((option) => option.textContent)).toEqual(['Inner', 'Left', 'Right', 'Full'])
  expect(type).toHaveValue('left')
  expect(help('join type')).toHaveAccessibleDescription(
    'Which rows stay when they find no pair. Inner keeps only the rows that pair up. Left keeps every orders row, '
      + 'Right keeps every regions row, and Full keeps every row of both.',
  )
  await userEvent.selectOptions(type, 'full')
  await userEvent.selectOptions(screen.getByLabelText('X axis'), 'regions.name')
  await userEvent.selectOptions(screen.getByLabelText('Y axis'), 'orders.amount')
  await userEvent.click(screen.getByRole('button', { name: 'Add bar chart' }))

  expect(onSave).toHaveBeenCalledWith({
    kind: 'bar',
    sourceId: 7,
    join: { sourceId: 8, on: 'region', to: 'code', kind: 'full' },
    name: null,
    scales: AUTO,
    x: 'regions.name',
    y: 'orders.amount',
    aggregate: 'sum',
  })
})

it('opens a joined chart with its join', () => {
  renderForm(
    {
      id: 'w3',
      title: 'Sum of orders.amount by regions.name',
      kind: 'bar',
      sourceId: 7,
      join: { sourceId: 8, on: 'region', to: 'code', kind: 'inner' },
      name: null,
      scales: null,
      x: 'regions.name',
      y: 'orders.amount',
      aggregate: 'sum',
    },
    [orders, regions],
  )

  expect(screen.getByLabelText('Join')).toHaveValue('8')
  expect(screen.getByLabelText('Join type')).toHaveValue('inner')
  expect(screen.getByLabelText('X axis')).toHaveValue('regions.name')
})

it('sets a pivot table by its rows, its columns, and its value', async () => {
  const { onSave } = renderForm()
  await userEvent.selectOptions(screen.getByLabelText('Chart'), 'pivot')

  await userEvent.selectOptions(screen.getByLabelText('Rows'), 'day')
  await userEvent.selectOptions(screen.getByLabelText('Columns'), 'region')
  await userEvent.selectOptions(screen.getByLabelText('Value'), 'amount')
  expect(help('aggregate')).toHaveAccessibleDescription(`Rows with the same day and region become one value. ${COMBINING}`)
  await userEvent.click(screen.getByRole('button', { name: 'Add pivot table' }))

  expect(onSave).toHaveBeenCalledWith({
    kind: 'pivot',
    sourceId: 7,
    join: null,
    name: null,
    scales: null,
    row: 'day',
    column: 'region',
    y: 'amount',
    aggregate: 'sum',
  })
})

it('asks for the number column, then its aggregate, and explains both the aggregate and the chart type', async () => {
  const { onSave } = renderForm()
  const aggregate = screen.getByLabelText('Aggregate')
  expect(help('aggregate')).toHaveAccessibleDescription(
    `Rows with the same values in the columns above become one value. ${COMBINING}`,
  )
  expect(help('bar charts')).toHaveAccessibleDescription('Bars whose heights compare a number across categories.')

  await userEvent.selectOptions(screen.getByLabelText('X axis'), 'day')
  await userEvent.selectOptions(screen.getByLabelText('Y axis'), 'amount')

  expect(screen.getByLabelText('Y axis').compareDocumentPosition(aggregate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(aggregate).getAllByRole('option').map((option) => option.textContent)).toEqual([
    'Sum',
    'Average',
    'Minimum',
    'Maximum',
    'Count',
  ])
  expect(help('aggregate')).toHaveAccessibleDescription(`Rows with the same day become one value. ${COMBINING}`)

  await userEvent.selectOptions(aggregate, 'max')
  await userEvent.click(screen.getByRole('button', { name: 'Add bar chart' }))
  expect(onSave).toHaveBeenCalledWith({
    kind: 'bar',
    sourceId: 7,
    join: null,
    name: null,
    scales: AUTO,
    x: 'day',
    y: 'amount',
    aggregate: 'max',
  })
})

it('counts rows without a number column', async () => {
  const { onSave } = renderForm()

  await userEvent.selectOptions(screen.getByLabelText('X axis'), 'day')
  await userEvent.selectOptions(screen.getByLabelText('Aggregate'), 'count')

  expect(screen.getByLabelText('Y axis')).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Add bar chart' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'bar', x: 'day', y: null, aggregate: 'count' }))
})

it('starts from the chart being edited and saves its changes', async () => {
  const { onSave } = renderForm({
    id: 'w1',
    title: 'Average of amount by day and region',
    kind: 'stacked',
    sourceId: 7,
    join: null,
    name: null,
    scales: null,
    x: 'day',
    group: 'region',
    y: 'amount',
    aggregate: 'avg',
  })

  expect(screen.getByLabelText('Chart')).toHaveValue('stacked')
  expect(screen.getByLabelText('X axis')).toHaveValue('day')
  expect(screen.getByLabelText('Stack by')).toHaveValue('region')
  expect(screen.getByLabelText('Y axis')).toHaveValue('amount')
  const aggregate = screen.getByLabelText('Aggregate')
  expect(aggregate).toHaveValue('avg')

  await userEvent.selectOptions(aggregate, 'sum')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

  expect(onSave).toHaveBeenCalledWith({
    kind: 'stacked',
    sourceId: 7,
    join: null,
    name: null,
    scales: AUTO,
    x: 'day',
    group: 'region',
    y: 'amount',
    aggregate: 'sum',
  })
})

it('starts a tree from its levels', () => {
  renderForm({
    id: 'w2',
    title: 'Sum of amount by region, then day',
    kind: 'treemap',
    sourceId: 7,
    join: null,
    name: null,
    scales: null,
    levels: ['region', 'day'],
    y: 'amount',
    aggregate: 'sum',
  })

  expect(screen.getByLabelText('Level 1')).toHaveValue('region')
  expect(screen.getByLabelText('Level 2, optional')).toHaveValue('day')
  expect(help('aggregate')).toHaveAccessibleDescription(`Rows with the same region and day become one value. ${COMBINING}`)
})

it('names any chart, and shows the generated name until one is typed', async () => {
  const { onSave } = renderForm()
  await userEvent.selectOptions(screen.getByLabelText('Chart'), 'heatmap')
  await userEvent.selectOptions(screen.getByLabelText('Columns'), 'day')
  await userEvent.selectOptions(screen.getByLabelText('Rows'), 'region')
  await userEvent.selectOptions(screen.getByLabelText('Aggregate'), 'count')

  expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'Count by day and region')
  await userEvent.type(screen.getByLabelText('Name'), 'Busy days')
  await userEvent.click(screen.getByRole('button', { name: 'Add heatmap chart' }))

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'heatmap', name: 'Busy days' }))
})

it("sets a table's name, default sort, rows, and column formats", async () => {
  const { onSave } = renderForm()
  await userEvent.selectOptions(screen.getByLabelText('Chart'), 'table')

  expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'All columns')
  await userEvent.type(screen.getByLabelText('Name'), 'Q3 orders')
  await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'amount')
  await userEvent.selectOptions(screen.getByLabelText('Direction'), 'desc')
  await userEvent.selectOptions(screen.getByLabelText('Rows'), 'list')
  const formats = within(screen.getByRole('group', { name: 'Formats' }))
  expect(formats.queryByLabelText('region')).not.toBeInTheDocument()
  await userEvent.selectOptions(formats.getByLabelText('amount'), 'money')
  await userEvent.selectOptions(formats.getByLabelText('Currency'), 'EUR')
  await userEvent.selectOptions(formats.getByLabelText('day'), 'date')
  await userEvent.click(screen.getByRole('button', { name: 'Add table' }))

  expect(onSave).toHaveBeenCalledWith({
    kind: 'table',
    sourceId: 7,
    join: null,
    columns: [],
    sort: { column: 'amount', direction: 'desc' },
    pageSize: null,
    formats: { day: { kind: 'date' }, amount: { kind: 'money', currency: 'EUR' } },
    count: false,
    name: 'Q3 orders',
    scales: null,
  })
})

it('counts a table by its shown columns, sorting by the count, most first, unless told otherwise', async () => {
  const { onSave } = renderForm()
  await userEvent.selectOptions(screen.getByLabelText('Chart'), 'table')
  await userEvent.click(within(screen.getByRole('group', { name: 'Columns, or none for all' })).getByLabelText('region'))

  await userEvent.click(screen.getByLabelText('Count'))

  const sortBy = screen.getByLabelText('Sort by')
  expect(within(sortBy).getAllByRole('option').map((option) => option.textContent)).toEqual(['Count', 'region'])
  expect(screen.getByLabelText('Direction')).toHaveValue('desc')
  expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'Count by region')
  expect(screen.getByRole('button', { name: 'About count' })).toHaveAccessibleDescription(
    'Rows that match in every shown column become one row, with a Count column saying how many there were. '
      + 'The most frequent come first unless the table sorts another way.',
  )

  await userEvent.click(screen.getByRole('button', { name: 'Add table' }))
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ columns: ['region'], count: true, sort: { column: '__scry_count', direction: 'desc' } }),
  )
})

it('keeps the generated name for a table left unnamed, and opens a table with its settings', async () => {
  const { onSave } = renderForm({
    id: 't1',
    title: 'amount',
    kind: 'table',
    sourceId: 7,
    join: null,
    columns: ['amount'],
    sort: null,
    pageSize: 50,
    formats: { amount: { kind: 'number', decimals: 1 } },
    count: false,
    name: null,
    scales: null,
  })

  expect(screen.getByLabelText('Name')).toHaveValue('')
  expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'amount')
  expect(screen.getByLabelText('Rows')).toHaveValue('50')
  expect(within(screen.getByRole('group', { name: 'Formats' })).getByLabelText('Decimals')).toHaveValue('1')

  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: null, pageSize: 50 }))
})

it('sets the scale of a number x axis and the y axis, and opens a chart with its scales', async () => {
  const founded: Source = { ...orders, columns: [{ name: 'founded', type: 'Int64' }, { name: 'amount', type: 'Int64' }] }
  const { onSave } = renderForm(null, [founded])
  await userEvent.selectOptions(screen.getByLabelText('Chart'), 'line')
  expect(screen.queryByLabelText('X min')).not.toBeInTheDocument()

  await userEvent.selectOptions(screen.getByLabelText('X axis'), 'founded')
  await userEvent.selectOptions(screen.getByLabelText('Aggregate'), 'count')
  await userEvent.type(screen.getByLabelText('X min'), '1970')
  await userEvent.type(screen.getByLabelText('X max'), '2025')
  await userEvent.selectOptions(screen.getByLabelText('Y scale'), 'log')
  await userEvent.click(screen.getByRole('button', { name: 'Add line chart' }))

  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      scales: { x: { min: 1970, max: 2025, log: false }, y: { min: null, max: null, log: true } },
    }),
  )
})

it('will not save a scale whose minimum is not below its maximum', async () => {
  renderForm()
  await userEvent.selectOptions(screen.getByLabelText('X axis'), 'day')
  await userEvent.selectOptions(screen.getByLabelText('Aggregate'), 'count')

  await userEvent.type(screen.getByLabelText('Y min'), '10')
  await userEvent.type(screen.getByLabelText('Y max'), '5')

  expect(screen.getByRole('button', { name: 'Add bar chart' })).toBeDisabled()
  expect(screen.getByText("Each minimum must be below its maximum, and a log scale's bounds above zero.")).toBeInTheDocument()
})

it('cancels without saving', async () => {
  const { onSave, onCancel } = renderForm()

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onCancel).toHaveBeenCalled()
  expect(onSave).not.toHaveBeenCalled()
})

it("keeps a chart's own full-screen scrolling, and how many x values a screenful shows", async () => {
  const { onSave } = renderForm({
    id: 'w1',
    title: 'Sum of amount by day',
    kind: 'bar',
    sourceId: 7,
    join: null,
    name: null,
    scales: null,
    x: 'day',
    y: 'amount',
    aggregate: 'sum',
  })

  await userEvent.selectOptions(screen.getByLabelText('Scrolling'), 'Its own')
  await userEvent.selectOptions(screen.getByLabelText('Speed'), 'Fast, 8 s a screenful')
  await userEvent.clear(screen.getByLabelText('X values at once'))
  await userEvent.type(screen.getByLabelText('X values at once'), '30')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ presentation: { follow: 'own', wrap: 'loop', pace: 'fast', seconds: 15, window: 30 } }),
  )
})
