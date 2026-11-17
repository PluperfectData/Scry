import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, getNexusLink, type NexusLink, startNexusPairing, unlinkNexus } from '../api'
import { leaveFor } from '../browser'
import { NexusLinkSection } from './NexusLinkSection'

jest.mock('../api', () => ({ ...jest.requireActual('../api'), getNexusLink: jest.fn(), startNexusPairing: jest.fn(), unlinkNexus: jest.fn() }))

jest.mock('../browser', () => ({ leaveFor: jest.fn() }))

const unlinked: NexusLink = { linked: false, nexusUrl: null, appName: null, workspaceName: null, pushKeyName: null, pushKeyPrefix: null, linkedAt: null }

const linked: NexusLink = { linked: true, nexusUrl: 'http://localhost:6163', appName: 'Scry at localhost:6161', workspaceName: 'Acme', pushKeyName: 'Nexus at localhost:6163', pushKeyPrefix: 'scry_ab12', linkedAt: '2026-11-15T12:00:00Z' }

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/settings')
})

it('links by sending the admin to Nexus to approve', async () => {
  jest.mocked(getNexusLink).mockResolvedValue(unlinked)
  jest.mocked(startNexusPairing).mockResolvedValue({ approveUrl: 'http://localhost:6165/pair?id=p-123' })
  render(<NexusLinkSection />)

  expect(await screen.findByLabelText('Nexus address')).toHaveValue('http://localhost:6163')
  await userEvent.click(screen.getByRole('button', { name: 'Link Nexus' }))

  expect(startNexusPairing).toHaveBeenCalledWith('http://localhost:6163')
  expect(leaveFor).toHaveBeenCalledWith('http://localhost:6165/pair?id=p-123')
})

it('says why Nexus could not be reached', async () => {
  jest.mocked(getNexusLink).mockResolvedValue(unlinked)
  jest.mocked(startNexusPairing).mockRejectedValue(new ApiError(502, 'Nexus did not answer at http://localhost:6163.'))
  render(<NexusLinkSection />)

  await userEvent.click(await screen.findByRole('button', { name: 'Link Nexus' }))

  expect(await screen.findByText('Nexus did not answer at http://localhost:6163.')).toBeInTheDocument()
  expect(leaveFor).not.toHaveBeenCalled()
})

it('shows the link and its outcome after Nexus sends the admin back, and unlinks', async () => {
  window.history.replaceState(null, '', '/settings?linked=1')
  jest.mocked(getNexusLink).mockResolvedValue(linked)
  jest.mocked(unlinkNexus).mockResolvedValue(undefined)
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<NexusLinkSection />)

  expect(screen.getByText('This workspace is linked to Nexus.')).toBeInTheDocument()
  expect(await screen.findByText(/as Scry at localhost:6161, in the Acme workspace/)).toBeInTheDocument()
  expect(screen.getByText(/Nexus sends rows with the push key Nexus at localhost:6163/)).toHaveTextContent('scry_ab12…')
  expect(window.location.search).toBe('')
  await userEvent.click(screen.getByRole('button', { name: 'Unlink' }))

  expect(unlinkNexus).toHaveBeenCalled()
  expect(await screen.findByLabelText('Nexus address')).toBeInTheDocument()
})

it('shows why linking failed', () => {
  window.history.replaceState(null, '', "/settings?error=Nexus's%20admin%20declined%20linking%20Scry.")
  jest.mocked(getNexusLink).mockResolvedValue(unlinked)
  render(<NexusLinkSection />)

  expect(screen.getByText("Nexus's admin declined linking Scry.")).toBeInTheDocument()
})
