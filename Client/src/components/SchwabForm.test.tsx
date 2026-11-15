import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, listSchwabStreams, startSchwabSignIn, type Connector } from '../api'
import { leaveFor } from '../browser'
import { SchwabForm } from './SchwabForm'

jest.mock('../api', () => ({ ...jest.requireActual('../api'), listSchwabStreams: jest.fn(), startSchwabSignIn: jest.fn() }))
jest.mock('../browser', () => ({ leaveFor: jest.fn() }))

const schwab: Connector = {
  id: 'schwab',
  name: 'Charles Schwab',
  description: 'Reads a Schwab sign-in.',
  fields: [
    { name: 'startDate', label: 'Read history from (yyyy-MM-dd)', kind: 'Text', required: true, choices: null },
    { name: 'symbols', label: 'Symbols (comma-separated)', kind: 'Text', required: false, choices: null },
  ],
  needs: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listSchwabStreams).mockResolvedValue([
    { name: 'balances', columns: 15 },
    { name: 'quotes', columns: 23 },
  ])
})

it('says which settings Scry needs before it can sign in', () => {
  render(<SchwabForm connector={{ ...schwab, needs: ['Schwab:AppKey', 'Schwab:AppSecret'] }} onCancel={jest.fn()} />)

  expect(screen.getByText(/Set Schwab:AppKey and Schwab:AppSecret in Scry's settings/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sign in to Schwab' })).not.toBeInTheDocument()
  expect(listSchwabStreams).not.toHaveBeenCalled()
})

it('sends the settings and picked streams, then goes to Schwab to sign in', async () => {
  jest.mocked(startSchwabSignIn).mockResolvedValue({ url: 'https://api.schwabapi.com/v1/oauth/authorize?state=abc' })
  render(<SchwabForm connector={schwab} onCancel={jest.fn()} />)

  expect(screen.getByLabelText('Read history from (yyyy-MM-dd)')).toHaveValue(
    `${new Date().getUTCFullYear() - 1}${new Date().toISOString().slice(4, 10)}`,
  )
  await userEvent.type(screen.getByLabelText('Symbols (comma-separated)'), 'SPY')
  await userEvent.click(await screen.findByLabelText('quotes'))
  expect(screen.getByLabelText('Source name for quotes')).toHaveValue('schwab_quotes')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in to Schwab' }))

  expect(startSchwabSignIn).toHaveBeenCalledWith(expect.objectContaining({ symbols: 'SPY' }), [
    { table: 'quotes', name: 'schwab_quotes' },
  ])
  expect(leaveFor).toHaveBeenCalledWith('https://api.schwabapi.com/v1/oauth/authorize?state=abc')
})

it('says why a sign-in could not start, and stays on the form', async () => {
  jest.mocked(startSchwabSignIn).mockRejectedValue(new ApiError(409, "A source named 'schwab_quotes' already exists."))
  render(<SchwabForm connector={schwab} onCancel={jest.fn()} />)

  await userEvent.click(await screen.findByLabelText('quotes'))
  await userEvent.click(screen.getByRole('button', { name: 'Sign in to Schwab' }))

  expect(await screen.findByText("A source named 'schwab_quotes' already exists.")).toBeInTheDocument()
  expect(leaveFor).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Sign in to Schwab' })).toBeEnabled()
})
