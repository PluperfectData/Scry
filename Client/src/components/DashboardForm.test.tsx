import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api'
import { DEFAULT_PRESENTATION } from '../presentation'
import { DashboardForm } from './DashboardForm'

it('asks only for a name when adding a dashboard', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  render(<DashboardForm editing={false} submitLabel="Create" onSave={onSave} onCancel={jest.fn()} />)

  expect(screen.queryByLabelText('Open this dashboard first')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Name'), ' Sales ')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))

  expect(onSave).toHaveBeenCalledWith('Sales', false, DEFAULT_PRESENTATION)
})

it("offers the landing choice when editing, and says why a save was refused", async () => {
  const onSave = jest.fn().mockRejectedValue(new ApiError(400, 'A dashboard needs a name of 200 characters or fewer.'))
  render(<DashboardForm name="Sales" editing submitLabel="Save" onSave={onSave} onCancel={jest.fn()} />)

  expect(screen.getByLabelText('Name')).toHaveValue('Sales')
  await userEvent.click(screen.getByLabelText('Open this dashboard first'))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(onSave).toHaveBeenCalledWith('Sales', true, DEFAULT_PRESENTATION)
  expect(await screen.findByText('A dashboard needs a name of 200 characters or fewer.')).toBeInTheDocument()
})

it('sets whether the name shows and how the data scrolls in full screen when editing', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined)
  render(<DashboardForm name="Sales" editing submitLabel="Save" onSave={onSave} onCancel={jest.fn()} />)

  await userEvent.click(screen.getByLabelText('Show the title'))
  await userEvent.selectOptions(screen.getByLabelText('At the end'), 'Back and forth')
  await userEvent.selectOptions(screen.getByLabelText('Speed'), 'Custom')
  await userEvent.clear(screen.getByLabelText('Seconds a screenful'))
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Seconds a screenful'), '40')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(onSave).toHaveBeenCalledWith('Sales', false, {
    showTitle: false,
    scroll: true,
    wrap: 'reverse',
    pace: 'custom',
    seconds: 40,
  })
})
