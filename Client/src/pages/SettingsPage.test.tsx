import { render, screen } from '@testing-library/react'
import type { Me } from '../api'
import { SessionContext } from '../session'
import { SettingsPage } from './SettingsPage'

jest.mock('../components/InstanceSection', () => ({
  InstanceSection: () => jest.requireActual('react').createElement('h2', null, 'Addresses'),
}))

const member: Me = { signedIn: true, id: 2, email: 'rowan@acme.test', isAdmin: false, hasPassword: true }

const renderAs = (me: Me) =>
  render(
    <SessionContext.Provider value={{ me, setMe: jest.fn() }}>
      <SettingsPage />
    </SessionContext.Provider>,
  )

it("shows an admin Scry's own addresses, mail, and database", () => {
  renderAs({ ...member, isAdmin: true })

  expect(screen.getByRole('heading', { level: 2, name: 'Addresses' })).toBeInTheDocument()
})

it('tells anyone else only admins change them', () => {
  renderAs(member)

  expect(screen.getByText("Only admins change Scry's addresses, mail, and database.")).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'Addresses' })).not.toBeInTheDocument()
})
