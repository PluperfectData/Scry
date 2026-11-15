import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Slideout } from './Slideout'

it('opens as a dialog named by its title, with its contents', () => {
  render(
    <Slideout open title="Add a chart" onClose={jest.fn()}>
      <p>The form</p>
    </Slideout>,
  )

  expect(screen.getByRole('dialog', { name: 'Add a chart' })).toHaveAttribute('open')
  expect(screen.getByText('The form')).toBeInTheDocument()
})

it('leaves its contents out while closed, so they start fresh each time it opens', () => {
  const { rerender } = render(
    <Slideout open title="Add a chart" onClose={jest.fn()}>
      <p>The form</p>
    </Slideout>,
  )

  rerender(
    <Slideout open={false} title="Add a chart" onClose={jest.fn()}>
      <p>The form</p>
    </Slideout>,
  )

  expect(screen.queryByText('The form')).not.toBeInTheDocument()
})

it('closes from its close button', async () => {
  const onClose = jest.fn()
  render(
    <Slideout open title="Add a chart" onClose={onClose}>
      <p>The form</p>
    </Slideout>,
  )

  await userEvent.click(screen.getByRole('button', { name: 'Close' }))

  expect(onClose).toHaveBeenCalled()
})

it('closes on a click beside the panel, but not when a press inside the panel ends there', () => {
  const onClose = jest.fn()
  render(
    <Slideout open title="Add a chart" onClose={onClose}>
      <p>The form</p>
    </Slideout>,
  )
  const dialog = screen.getByRole('dialog')

  fireEvent.pointerDown(screen.getByText('The form'))
  fireEvent.click(dialog)
  expect(onClose).not.toHaveBeenCalled()

  fireEvent.pointerDown(dialog)
  fireEvent.click(dialog)
  expect(onClose).toHaveBeenCalledTimes(1)
})
