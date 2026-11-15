import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api'
import { DashboardForm } from './DashboardForm'

it('asks only for a name when adding a dashboard', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  render(<DashboardForm offerLanding={false} submitLabel="Create" onSave={onSave} onCancel={jest.fn()} />)

  expect(screen.queryByLabelText('Open this dashboard first')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Name'), ' Sales ')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))

  expect(onSave).toHaveBeenCalledWith('Sales', false)
})

it("offers the landing choice when editing, and says why a save was refused", async () => {
  const onSave = jest.fn().mockRejectedValue(new ApiError(400, 'A dashboard needs a name of 200 characters or fewer.'))
  render(<DashboardForm name="Sales" offerLanding submitLabel="Save" onSave={onSave} onCancel={jest.fn()} />)

  expect(screen.getByLabelText('Name')).toHaveValue('Sales')
  await userEvent.click(screen.getByLabelText('Open this dashboard first'))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(onSave).toHaveBeenCalledWith('Sales', true)
  expect(await screen.findByText('A dashboard needs a name of 200 characters or fewer.')).toBeInTheDocument()
})
