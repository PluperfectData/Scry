import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Help } from './Help'

const tip = () => document.querySelector('.tooltip')

it('explains its term to a screen reader, and shows the explanation on a tap until tapped again', async () => {
  render(<Help term="aggregate">How rows combine into one value.</Help>)
  const button = screen.getByRole('button', { name: 'About aggregate' })

  expect(button).toHaveAccessibleDescription('How rows combine into one value.')

  await userEvent.pointer({ keys: '[TouchA]', target: button })
  expect(tip()).toHaveTextContent('How rows combine into one value.')

  await userEvent.pointer({ keys: '[TouchA]', target: button })
  expect(tip()).toBeNull()
})

it('closes when something else is pressed', async () => {
  render(
    <>
      <Help term="bins">How many ranges.</Help>
      <p>Elsewhere</p>
    </>,
  )

  await userEvent.pointer({ keys: '[TouchA]', target: screen.getByRole('button', { name: 'About bins' }) })
  expect(tip()).not.toBeNull()

  await userEvent.pointer({ keys: '[TouchA]', target: screen.getByText('Elsewhere') })
  expect(tip()).toBeNull()
})
