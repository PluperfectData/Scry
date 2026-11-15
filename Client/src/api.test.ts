import { ApiError, getPivot, getRows, getSeries, uploadSource } from './api'

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock
})

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

it('uploads the file, its name, and its delimiter as a form', async () => {
  fetchMock.mockResolvedValue(reply(201, { id: 1, name: 'orders' }))
  const file = new File(['day,amount\n'], 'orders.csv', { type: 'text/csv' })

  const source = await uploadSource('orders', file, 'Semicolon')

  expect(source).toEqual({ id: 1, name: 'orders' })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('http://localhost:6161/sources')
  expect(init.method).toBe('POST')
  expect(init.body.get('name')).toBe('orders')
  expect(init.body.get('file')).toBeInstanceOf(File)
  expect(init.body.get('delimiter')).toBe('Semicolon')
})

it('leaves y out of a count series', async () => {
  fetchMock.mockResolvedValue(reply(200, { xType: 'category', points: [], truncated: false }))

  await getSeries({ sourceId: 3, join: null }, 'region', null, 'count')

  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:6161/sources/3/series?x=region&aggregate=count')
})

it('asks for one run of rows in a sort, or in source order without one', async () => {
  fetchMock.mockResolvedValue(reply(200, { columns: [], values: [], total: 0 }))

  await getRows({ sourceId: 3, join: null }, { columns: ['day', 'amount'], sort: { column: 'amount', direction: 'desc' }, count: false, offset: 50, limit: 25 })
  await getRows({ sourceId: 3, join: null }, { columns: [], sort: null, count: false, offset: 0, limit: 100 })

  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:6161/sources/3/rows?columns=day&columns=amount&sort=amount&direction=desc&offset=50&limit=25',
  )
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:6161/sources/3/rows?offset=0&limit=100')
})

it('asks for a counted table', async () => {
  fetchMock.mockResolvedValue(reply(200, { columns: [], values: [], total: 0 }))

  await getRows({ sourceId: 3, join: null }, { columns: ['city'], sort: null, count: true, offset: 0, limit: 25 })

  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:6161/sources/3/rows?columns=city&count=true&offset=0&limit=25')
})

it('adds the joined source to any chart request, and asks for a pivot by row and column', async () => {
  fetchMock.mockResolvedValue(reply(200, { xType: 'category', points: [], truncated: false }))
  const from = { sourceId: 3, join: { sourceId: 4, on: 'region', to: 'code', kind: 'left' } } as const

  await getPivot(from, { row: 'orders.day', column: 'regions.name', y: 'orders.amount', aggregate: 'sum' })

  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:6161/sources/3/pivot?row=orders.day&column=regions.name&aggregate=sum&y=orders.amount'
      + '&join=4&joinOn=region&joinTo=code&joinKind=left',
  )
})

it("throws the API's problem detail with its status", async () => {
  fetchMock.mockResolvedValue(reply(409, { title: 'Conflict', detail: "A source named 'orders' already exists." }))

  const error = await uploadSource('orders', new File([''], 'orders.csv'), '').catch((e: unknown) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 409, message: "A source named 'orders' already exists." })
})
