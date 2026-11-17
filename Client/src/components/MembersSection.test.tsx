import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listUsers, removeMember, setMember, type User, type WorkspaceDetail } from '../api'
import { MembersSection } from './MembersSection'

jest.mock('../workspace', () => jest.requireActual('../../jest/workspace').workspaceMock())
const { openWorkspace, opened, workspaceDetail } = jest.requireActual('../../jest/workspace')

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listUsers: jest.fn(),
  setMember: jest.fn(),
  removeMember: jest.fn(),
}))

const user = (id: number, email: string, isAdmin = false): User => ({
  id,
  email,
  isAdmin,
  hasPassword: true,
  createdAt: '2026-11-16T00:00:00Z',
  signedInAt: null,
  workspaces: [],
})

const withMembers = (members: WorkspaceDetail['members']): WorkspaceDetail => ({ ...workspaceDetail(), members })

beforeEach(() => {
  jest.clearAllMocks()
  openWorkspace.current = { ...opened(), workspace: withMembers([{ userId: 2, email: 'rowan@acme.test', role: 'Viewer' }]) }
  jest.mocked(listUsers).mockResolvedValue([user(1, 'admin@acme.test', true), user(2, 'rowan@acme.test'), user(3, 'sam@acme.test')])
})

it('lists each member with their role, and changes a role', async () => {
  const changed = withMembers([{ userId: 2, email: 'rowan@acme.test', role: 'Editor' }])
  jest.mocked(setMember).mockResolvedValue(changed)
  render(<MembersSection />)

  await userEvent.selectOptions(screen.getByLabelText('Role for rowan@acme.test'), 'Editor')

  expect(setMember).toHaveBeenCalledWith(1, 2, 'Editor')
  expect(openWorkspace.current.update).toHaveBeenCalledWith(changed)
})

it('adds a user who is not an admin, as a viewer unless picked otherwise', async () => {
  jest.mocked(setMember).mockResolvedValue(withMembers([]))
  render(<MembersSection />)
  const form = (await screen.findByRole('button', { name: 'Add member' })).closest('form') as HTMLElement

  expect(within(form).getAllByRole('option').map((option) => option.textContent)).toEqual(['Pick a user', 'sam@acme.test', 'Viewer', 'Editor'])
  await userEvent.selectOptions(within(form).getByLabelText('Add a member'), 'sam@acme.test')
  await userEvent.selectOptions(within(form).getByLabelText('As'), 'Editor')
  await userEvent.click(within(form).getByRole('button', { name: 'Add member' }))

  expect(setMember).toHaveBeenCalledWith(1, 3, 'Editor')
})

it('takes a member out', async () => {
  jest.mocked(removeMember).mockResolvedValue(withMembers([]))
  render(<MembersSection />)

  await userEvent.click(screen.getByRole('button', { name: 'Take out' }))

  expect(removeMember).toHaveBeenCalledWith(1, 2)
})
