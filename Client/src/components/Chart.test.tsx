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
