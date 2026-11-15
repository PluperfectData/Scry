import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { NoticeProvider } from '../NoticeProvider'
import { useNotices, type NoticeOptions } from '../notices'
import { NoticeStack } from './NoticeStack'

let notify: (message: string, options?: NoticeOptions) => string

function Notifier() {
  const notices = useNotices()
  useEffect(() => {
    notify = notices.notify
  }, [notices])
  return null
}

function renderStack() {
  const view = render(
    <NoticeProvider>
      <Notifier />
      <NoticeStack />
    </NoticeProvider>,
  )
  return { ...view, user: userEvent.setup({ advanceTimers: jest.advanceTimersByTime }) }
}

const banner = (text: string) => screen.getByText(text).closest('.notice')

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

it('closes a banner by itself after 5 seconds, with a ring around its ×', () => {
  renderStack()

  act(() => void notify('Synced'))
  expect(banner('Synced')?.querySelector('.notice-timer')).not.toBeNull()

  act(() => jest.advanceTimersByTime(4999))
  expect(screen.getByText('Synced')).toBeInTheDocument()
  act(() => jest.advanceTimersByTime(1))
  expect(screen.queryByText('Synced')).not.toBeInTheDocument()
})

it('closes after the seconds it was given', () => {
  renderStack()

  act(() => void notify('Saved', { seconds: 2 }))
  act(() => jest.advanceTimersByTime(2000))

  expect(screen.queryByText('Saved')).not.toBeInTheDocument()
})

it('keeps a banner without seconds until its × is pressed, and draws no ring', async () => {
  const { user } = renderStack()

  act(() => void notify('Not saved', { tone: 'error', seconds: null }))
  act(() => jest.advanceTimersByTime(60_000))
  expect(banner('Not saved')?.querySelector('.notice-timer')).toBeNull()
  expect(screen.getByRole('alert')).toHaveTextContent('Not saved')

  await user.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByText('Not saved')).not.toBeInTheDocument()
})

it('closes a timed banner early from its ×', async () => {
  const { user } = renderStack()

  act(() => void notify('Synced'))
  await user.click(screen.getByRole('button', { name: 'Dismiss' }))

  expect(screen.queryByText('Synced')).not.toBeInTheDocument()
})

it('stacks banners oldest first, each in its own tone', () => {
  const { container } = renderStack()

  act(() => {
    notify('Upload started')
    notify('Rows skipped', { tone: 'warning' })
    notify('Upload finished', { tone: 'success' })
  })

  const notices = [...container.querySelectorAll('.notice')]
  expect(notices.map((notice) => notice.textContent)).toEqual(['Upload startedDismiss', 'Rows skippedDismiss', 'Upload finishedDismiss'])
  expect(notices.map((notice) => notice.getAttribute('data-tone'))).toEqual(['info', 'warning', 'success'])
})

it('shows a notice with an id once, starting its timer again when it repeats', () => {
  const { container } = renderStack()

  act(() => void notify('Saved', { id: 'save', seconds: 2 }))
  act(() => jest.advanceTimersByTime(1500))
  act(() => void notify('Saved', { id: 'save', seconds: 2 }))
  act(() => jest.advanceTimersByTime(1500))

  expect(container.querySelectorAll('.notice')).toHaveLength(1)
  act(() => jest.advanceTimersByTime(500))
  expect(screen.queryByText('Saved')).not.toBeInTheDocument()
})
