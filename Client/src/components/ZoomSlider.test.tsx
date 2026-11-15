import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ZoomSlider } from './ZoomSlider'

it('zooms by the square root of two per press, and doubles every four steps of the slider', async () => {
  const onZoom = jest.fn()
  render(<ZoomSlider zoom={2} onZoom={onZoom} />)

  await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(onZoom).toHaveBeenLastCalledWith(expect.closeTo(2 * Math.SQRT2))
  await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
  expect(onZoom).toHaveBeenLastCalledWith(expect.closeTo(Math.SQRT2))

  fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '8' } })
  expect(onZoom).toHaveBeenLastCalledWith(4)
})

it('stops at 1× and 8×', () => {
  const { rerender } = render(<ZoomSlider zoom={1} onZoom={jest.fn()} />)
  expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled()

  rerender(<ZoomSlider zoom={8} onZoom={jest.fn()} />)
  expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
})
