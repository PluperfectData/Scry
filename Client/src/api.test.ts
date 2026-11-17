import { ApiError, enterWorkspace, getPivot, getRows, getSeries, listWorkspaces, mailLink, uploadSource } from './api'

// The session's client, reduced to a fetch at the API's address.
jest.mock('@pluperfect/jwt', () => ({
  createAuthClient:
    ({ baseUrl }: { baseUrl: string }) =>
    (path: string, init?: RequestInit) =>
      globalThis.fetch(`${baseUrl}${path}`, init),
}))

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock
  enterWorkspace(3)
})

// jsdom has no Response, so this is one in shape: JSON, or no body at all.
const reply = (status: number, body?: unknown) => ({
  ok: status < 400,
  status,
  headers: { get: (name: string) => (name === 'content-type' && body !== undefined ? 'application/json' : null) },
  json: async () => {
    if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
    return body
  },
})

it('uploads the file, its name, and its delimiter as a form', async () => {
  fetchMock.mockResolvedValue(reply(201, { id: 1, name: 'orders' }))
  const file = new File(['day,amount\n'], 'orders.csv', { type: 'text/csv' })

  const source = await uploadSource('orders', file, 'Semicolon')

  expect(source).toEqual({ id: 1, name: 'orders' })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('http://localhost:6161/workspaces/3/sources')
  expect(init.method).toBe('POST')
  expect(init.body.get('name')).toBe('orders')
  expect(init.body.get('file')).toBeInstanceOf(File)
  expect(init.body.get('delimiter')).toBe('Semicolon')
})

it('leaves y out of a count series', async () => {
  fetchMock.mockResolvedValue(reply(200, { xType: 'category', points: [], truncated: false }))

  await getSeries({ sourceId: 3, join: null }, 'region', null, 'count')

  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:6161/workspaces/3/sources/3/series?x=region&aggregate=count')
})

it('asks for one run of rows in a sort, or in source order without one', async () => {
  fetchMock.mockResolvedValue(reply(200, { columns: [], values: [], total: 0 }))

  await getRows({ sourceId: 3, join: null }, { columns: ['day', 'amount'], sort: { column: 'amount', direction: 'desc' }, count: false, offset: 50, limit: 25 })
  await getRows({ sourceId: 3, join: null }, { columns: [], sort: null, count: false, offset: 0, limit: 100 })

  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:6161/workspaces/3/sources/3/rows?columns=day&columns=amount&sort=amount&direction=desc&offset=50&limit=25',
  )
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:6161/workspaces/3/sources/3/rows?offset=0&limit=100')
})

it('asks for a counted table', async () => {
  fetchMock.mockResolvedValue(reply(200, { columns: [], values: [], total: 0 }))

  await getRows({ sourceId: 3, join: null }, { columns: ['city'], sort: null, count: true, offset: 0, limit: 25 })

  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:6161/workspaces/3/sources/3/rows?columns=city&count=true&offset=0&limit=25')
})

it('adds the joined source to any chart request, and asks for a pivot by row and column', async () => {
  fetchMock.mockResolvedValue(reply(200, { xType: 'category', points: [], truncated: false }))
  const from = { sourceId: 3, join: { sourceId: 4, on: 'region', to: 'code', kind: 'left' } } as const

  await getPivot(from, { row: 'orders.day', column: 'regions.name', y: 'orders.amount', aggregate: 'sum' })

  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:6161/workspaces/3/sources/3/pivot?row=orders.day&column=regions.name&aggregate=sum&y=orders.amount'
      + '&join=4&joinOn=region&joinTo=code&joinKind=left',
  )
})

it('asks for the workspace a page is in, and for the list of them at their own address', async () => {
  fetchMock.mockResolvedValue(reply(200, []))

  await listWorkspaces()
  enterWorkspace(5)
  await getSeries({ sourceId: 3, join: null }, 'region', null, 'count')

  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:6161/workspaces')
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:6161/workspaces/5/sources/3/series?x=region&aggregate=count')
})

it('takes an answer with no body, as the mailed link answers', async () => {
  fetchMock.mockResolvedValue(reply(202))

  await expect(mailLink('rowan@acme.test')).resolves.toBeUndefined()
})

it("throws the API's problem detail with its status", async () => {
  fetchMock.mockResolvedValue(reply(409, { title: 'Conflict', detail: "A source named 'orders' already exists." }))

  const error = await uploadSource('orders', new File([''], 'orders.csv'), '').catch((e: unknown) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 409, message: "A source named 'orders' already exists." })
})
