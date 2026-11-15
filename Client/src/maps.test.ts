import { echartsWith } from './echartsLoader'
import { loadMap } from './maps'

jest.mock('./echartsLoader', () => ({ echartsWith: jest.fn() }))
jest.mock('topojson-client', () => ({ feature: () => ({ type: 'FeatureCollection', features: [] }) }))

const registerMap = jest.fn()
const fetchMock = jest.fn()

beforeEach(() => {
  registerMap.mockReset()
  fetchMock.mockReset()
  global.fetch = fetchMock
  jest.mocked(echartsWith).mockResolvedValue({ registerMap } as never)
})

const reply = (ok: boolean) => ({ ok, json: async () => ({ type: 'Topology', objects: { states: {} } }) })

it('registers the boundaries with the geo component installed', async () => {
  fetchMock.mockResolvedValue(reply(true))

  await loadMap('usa')

  expect(echartsWith).toHaveBeenCalledWith(['geo'])
  expect(registerMap).toHaveBeenCalledWith('usa', { type: 'FeatureCollection', features: [] })
})

it('tries again after the boundaries fail to load', async () => {
  fetchMock.mockResolvedValueOnce(reply(false)).mockResolvedValueOnce(reply(true))

  await expect(loadMap('world')).rejects.toThrow("The world map's boundaries did not load.")
  await loadMap('world')

  expect(registerMap).toHaveBeenCalledTimes(1)
})
