import { ApiError, getSeries, uploadSource } from './api'

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
  expect(url).toBe('http://localhost:8080/sources')
  expect(init.method).toBe('POST')
  expect(init.body.get('name')).toBe('orders')
  expect(init.body.get('file')).toBeInstanceOf(File)
  expect(init.body.get('delimiter')).toBe('Semicolon')
})

it('leaves y out of a count series', async () => {
  fetchMock.mockResolvedValue(reply(200, { xType: 'category', points: [], truncated: false }))

  await getSeries(3, 'region', null, 'count')

  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/sources/3/series?x=region&aggregate=count')
})

it("throws the API's problem detail with its status", async () => {
  fetchMock.mockResolvedValue(reply(409, { title: 'Conflict', detail: "A source named 'orders' already exists." }))

  const error = await uploadSource('orders', new File([''], 'orders.csv'), '').catch((e: unknown) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 409, message: "A source named 'orders' already exists." })
})
