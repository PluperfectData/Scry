import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { echartsFor } from '../echartsLoader'
import { Chart } from './Chart'

jest.mock('../echartsLoader', () => ({ echartsFor: jest.fn() }))

const setOption = jest.fn()

beforeEach(() => {
  setOption.mockClear()
  jest.mocked(echartsFor).mockResolvedValue({
    init: () => ({ setOption, resize: jest.fn(), dispose: jest.fn() }),
  } as unknown as Awaited<ReturnType<typeof echartsFor>>)
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

it('zooms its series from the slider, and keeps the zoom when a new option replaces the chart', async () => {
  const { rerender } = render(<Chart kind="map" option={{ id: 1 }} onError={jest.fn()} zoomOn="series" />)
  await waitFor(() => expect(setOption).toHaveBeenCalledWith({ id: 1 }, { notMerge: true }))

  await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(setOption).toHaveBeenLastCalledWith({ series: [{ zoom: expect.closeTo(Math.SQRT2) }] })

  rerender(<Chart kind="map" option={{ id: 2 }} onError={jest.fn()} zoomOn="series" />)
  await waitFor(() => expect(setOption).toHaveBeenCalledWith({ id: 2 }, { notMerge: true }))
  expect(setOption).toHaveBeenLastCalledWith({ series: [{ zoom: expect.closeTo(Math.SQRT2) }] })
})

it('zooms the geo component of a chart drawn on one', async () => {
  render(<Chart kind="flows" option={{ id: 1 }} onError={jest.fn()} zoomOn="geo" />)
  await waitFor(() => expect(setOption).toHaveBeenCalledWith({ id: 1 }, { notMerge: true }))

  await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))

  expect(setOption).toHaveBeenLastCalledWith({ geo: { zoom: expect.closeTo(Math.SQRT2) } })
})

it("shows the x-axis slider's range over it while the pointer is there, and through a drag that began there", async () => {
  const handlers: Record<string, (event?: { offsetY: number }) => void> = {}
  jest.mocked(echartsFor).mockResolvedValue({
    init: () => ({
      setOption,
      resize: jest.fn(),
      dispose: jest.fn(),
      getHeight: () => 300,
      getOption: () => ({ dataZoom: [{ startValue: 1975, endValue: 2020 }], xAxis: [{ type: 'value' }] }),
      getZr: () => ({ on: (name: string, handler: () => void) => (handlers[name] = handler), off: jest.fn() }),
      on: (name: string, handler: () => void) => (handlers[name] = handler),
      off: jest.fn(),
    }),
  } as unknown as Awaited<ReturnType<typeof echartsFor>>)
  render(<Chart kind="line" option={{ dataZoom: [{ type: 'slider' }] }} onError={jest.fn()} />)
  await waitFor(() => expect(handlers.mousemove).toBeDefined())

  act(() => handlers.mousemove({ offsetY: 300 - 28 - 8 }))
  expect(screen.getByText('1975 to 2020')).toBeInTheDocument()

  act(() => handlers.mousedown())
  act(() => handlers.globalout())
  expect(screen.getByText('1975 to 2020')).toBeInTheDocument()

  act(() => window.dispatchEvent(new Event('pointerup')))
  expect(screen.queryByText('1975 to 2020')).not.toBeInTheDocument()

  act(() => handlers.mousemove({ offsetY: 100 }))
  expect(screen.queryByText('1975 to 2020')).not.toBeInTheDocument()
})

it('has no slider unless it zooms', async () => {
  render(<Chart kind="bar" option={{ id: 1 }} onError={jest.fn()} />)
  await waitFor(() => expect(setOption).toHaveBeenCalled())

  expect(screen.queryByRole('slider', { name: 'Zoom' })).not.toBeInTheDocument()
})

it('drops its zoom bar in full screen and slides its x window one value at a time', async () => {
  jest.useFakeTimers()
  try {
    render(
      <Chart
        kind="line"
        option={{ dataZoom: [{ type: 'slider' }], grid: { bottom: 84 } }}
        onError={jest.fn()}
        presenting
        slide={{ positions: [10, 20, 30, 40], plan: { seconds: 2, wrap: 'restart', window: 2 } }}
      />,
    )
    await waitFor(() =>
      expect(setOption).toHaveBeenCalledWith(
        { dataZoom: [{ type: 'slider', show: false, xAxisIndex: 0 }], grid: { bottom: 32 } },
        { replaceMerge: ['dataZoom'] },
      ),
    )
    expect(setOption).toHaveBeenLastCalledWith({ dataZoom: [{ startValue: 10, endValue: 20 }] })

    act(() => jest.advanceTimersByTime(1000))

    expect(setOption).toHaveBeenLastCalledWith({ dataZoom: [{ startValue: 20, endValue: 30 }] })
  } finally {
    jest.useRealTimers()
  }
})

it('shows no zoom slider beside a map in full screen, and names no zoom it has not installed', async () => {
  render(<Chart kind="map" option={{ visualMap: {} }} onError={jest.fn()} zoomOn="series" presenting />)
  await waitFor(() => expect(setOption).toHaveBeenCalledWith({ visualMap: { calculable: false } }, {}))

  expect(setOption).not.toHaveBeenCalledWith(expect.anything(), { replaceMerge: ['dataZoom'] })
  expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeInTheDocument()
})

it('keeps the element it draws into through full screen and back', async () => {
  let drawnInto: HTMLElement | undefined
  jest.mocked(echartsFor).mockResolvedValue({
    init: (node: HTMLElement) => {
      drawnInto = node
      return { setOption, resize: jest.fn(), dispose: jest.fn() }
    },
  } as unknown as Awaited<ReturnType<typeof echartsFor>>)
  const onError = jest.fn()
  const { rerender } = render(<Chart kind="map" option={{ id: 1 }} onError={onError} zoomOn="series" />)
  await waitFor(() => expect(drawnInto).toBeDefined())

  rerender(<Chart kind="map" option={{ id: 1 }} onError={onError} zoomOn="series" presenting />)
  expect(drawnInto).toBeInTheDocument()
  expect(drawnInto).toHaveClass('chart')

  rerender(<Chart kind="map" option={{ id: 1 }} onError={onError} zoomOn="series" />)
  expect(drawnInto).toBeInTheDocument()
  expect(drawnInto).toHaveClass('chart')
})

it('draws its option whole again when full screen ends', async () => {
  const option = { dataZoom: [{ type: 'inside' }], legend: {} }
  const onError = jest.fn()
  const { rerender } = render(<Chart kind="line" option={option} onError={onError} presenting />)
  await waitFor(() =>
    expect(setOption).toHaveBeenCalledWith({ dataZoom: [], legend: { selectedMode: false } }, { replaceMerge: ['dataZoom'] }),
  )
  setOption.mockClear()

  rerender(<Chart kind="line" option={option} onError={onError} />)

  expect(setOption).toHaveBeenCalledWith(option, { notMerge: true })
})
