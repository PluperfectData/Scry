import { act, render, waitFor } from '@testing-library/react'
import { getInstall, type InstallView } from '../api'
import { RequireInstall } from './RequireInstall'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
jest.mock('../api', () => ({ ...jest.requireActual('../api'), getInstall: jest.fn() }))
const { navigate } = jest.requireActual('../../jest/router')

const view = (installed: boolean) => ({ installed }) as InstallView

beforeEach(() => jest.clearAllMocks())

it('sends a visitor to the installer while the instance is not set up', async () => {
  jest.mocked(getInstall).mockResolvedValue(view(false))
  render(<RequireInstall />)

  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/install', { replace: true }))
})

it('leaves a visitor where they are once the instance is set up', async () => {
  jest.mocked(getInstall).mockResolvedValue(view(true))
  render(<RequireInstall />)
  await act(async () => {})

  expect(getInstall).toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
})
