import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from './Tooltip'

const renderButton = () =>
  render(
    <Tooltip label="Add chart">
      <button type="button" aria-label="Add">
        +
      </button>
    </Tooltip>,
  )

it('shows its label a moment after a mouse rests on the control, and hides it when the mouse leaves', async () => {
  renderButton()

  await userEvent.hover(screen.getByRole('button', { name: 'Add' }))
  expect(await screen.findByText('Add chart')).toHaveClass('tooltip')

  await userEvent.unhover(screen.getByRole('button', { name: 'Add' }))
  expect(screen.queryByText('Add chart')).not.toBeInTheDocument()
})

it('shows its label when the keyboard focuses the control, and hides it on Escape', async () => {
  renderButton()

  await userEvent.tab()
  expect(screen.getByText('Add chart')).toBeInTheDocument()

  await userEvent.keyboard('{Escape}')
  expect(screen.queryByText('Add chart')).not.toBeInTheDocument()
})

it('keeps its label from screen readers, which hear the control’s own name', async () => {
  renderButton()

  await userEvent.tab()

  expect(screen.getByText('Add chart')).toHaveAttribute('aria-hidden', 'true')
})

it('renders inside a modal dialog, which would otherwise cover it', async () => {
  render(
    <dialog open>
      <Tooltip label="Close">
        <button type="button" aria-label="Shut">
          ×
        </button>
      </Tooltip>
    </dialog>,
  )

  await userEvent.tab()

  expect(screen.getByText('Close').parentElement).toBe(document.querySelector('dialog'))
})
