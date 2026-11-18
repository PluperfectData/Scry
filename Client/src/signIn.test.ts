import type { NexusSync, Source, SourceSignIn } from './api'
import { accountsLine, fromNow, offersSignIn, signInOf, signInStatus, staleNote, when } from './signIn'

const NOW = Date.parse('2026-11-18T15:00:00Z')

const base: SourceSignIn = {
  provider: 'Stripe',
  kind: 'Lasting',
  signedInAt: '2026-11-18T14:00:00Z',
  endsAt: null,
  endingSoon: false,
  ended: false,
  endedAt: null,
  keptAliveAt: null,
  accounts: [],
}

it('says how far off a time is, in the largest unit that reads well', () => {
  expect(fromNow('2026-11-25T15:00:00Z', NOW)).toBe('in 7 days')
  expect(fromNow('2026-11-19T14:00:00Z', NOW)).toBe('in 23 hours')
  expect(fromNow('2026-11-18T15:01:00Z', NOW)).toBe('in 1 minute')
  expect(fromNow('2026-11-18T14:00:00Z', NOW)).toBe('now')
})

it('says each kind of sign-in its own way, naming its provider', () => {
  const since = (provider: string) => `Signed in to ${provider} in Nexus ${when(base.signedInAt!)}.`

  expect(signInStatus(base, NOW)).toEqual({ tone: 'muted', text: `${since('Stripe')} It stays signed in.` })
  expect(signInStatus({ ...base, provider: 'Interactive Brokers', kind: 'KeptAlive' }, NOW)).toEqual({
    tone: 'muted',
    text: `${since('Interactive Brokers')} Nexus keeps it alive.`,
  })
  expect(signInStatus({ ...base, provider: 'Charles Schwab', kind: 'FixedClock', endsAt: '2026-11-19T14:00:00Z', endingSoon: true }, NOW)).toEqual({
    tone: 'warning',
    text: `Its Charles Schwab sign-in in Nexus ends soon: Charles Schwab ends it ${when('2026-11-19T14:00:00Z')}, in 23 hours. Sign in again to start its clock over.`,
  })
  expect(signInStatus({ ...base, ended: true }, NOW)).toEqual({
    tone: 'error',
    text: 'Its Stripe sign-in in Nexus ended. Nexus syncs nothing from it until someone signs in again.',
  })
})

it("takes a sync's sign-in, which is newer, over the list's, naming the sync's connector", () => {
  const source = { signIn: base } as Source
  const sync = { connectorName: 'Charles Schwab', signIn: { ...base, ended: true } } as unknown as NexusSync

  expect(signInOf(source, undefined)).toBe(base)
  expect(signInOf(source, sync)).toEqual({ ...base, ended: true, provider: 'Charles Schwab' })
})

it('offers Sign in again once a sign-in ends, and early only for a fixed clock', () => {
  expect(offersSignIn(null)).toBe(false)
  expect(offersSignIn(base)).toBe(false)
  expect(offersSignIn({ ...base, ended: true })).toBe(true)
  expect(offersSignIn({ ...base, kind: 'FixedClock' })).toBe(true)
})

it("says when a chart's data last arrived and when its sign-in ended", () => {
  const signIn = { ...base, provider: 'Charles Schwab', ended: true, endedAt: '2026-11-18T14:14:00Z' }

  expect(staleNote({ syncedAt: '2026-11-18T14:02:00Z' } as Source, signIn)).toBe(
    `This data was last updated ${when('2026-11-18T14:02:00Z')}. Its Charles Schwab sign-in ended ${when('2026-11-18T14:14:00Z')}.`,
  )
  expect(staleNote({ syncedAt: null } as Source, { ...signIn, endedAt: null })).toBe('No rows of this data have arrived. Its Charles Schwab sign-in ended.')
  expect(accountsLine(['…1234', '…5678'])).toBe('Reads the accounts …1234 and …5678.')
})
