import type { NexusSync, Source, SourceSignIn } from './api'

export type SignInTone = 'muted' | 'warning' | 'error'

const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

/** "Nov 25, 2026, 9:14 AM", in the browser's own zone. */
export const when = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** "in 7 days", "in 23 hours", "in 5 minutes", or "now". */
export function fromNow(at: string, now = Date.now()) {
  const ms = new Date(at).getTime() - now
  if (ms <= 0) return 'now'
  const minutes = Math.ceil(ms / 60_000)
  if (minutes < 60) return `in ${count(minutes, 'minute')}`
  const hours = Math.round(ms / 3_600_000)
  if (hours < 48) return `in ${count(hours, 'hour')}`
  return `in ${count(Math.round(ms / 86_400_000), 'day')}`
}

/** "a", "a and b", or "a, b, and c". */
export function list(items: string[]) {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

/** A Nexus source's sign-in: the sync's when the Sources page has read one, which is newer, or else the list's. */
export const signInOf = (source: Source, sync: NexusSync | undefined): SourceSignIn | null =>
  sync?.signIn ? { ...sync.signIn, provider: sync.connectorName } : source.signIn

/** What a Nexus source's card says of its connection's sign-in, and how loudly. */
export function signInStatus(signIn: SourceSignIn, now = Date.now()): { text: string; tone: SignInTone } {
  const { provider } = signIn
  if (signIn.ended) {
    const at = signIn.endedAt ? ` ${when(signIn.endedAt)}` : ''
    return { tone: 'error', text: `Its ${provider} sign-in in Nexus ended${at}. Nexus syncs nothing from it until someone signs in again.` }
  }

  const since = signIn.signedInAt ? `Signed in to ${provider} in Nexus ${when(signIn.signedInAt)}.` : `Signed in to ${provider} in Nexus.`
  if (signIn.kind === 'FixedClock' && signIn.endsAt) {
    const ends = `${provider} ends it ${when(signIn.endsAt)}, ${fromNow(signIn.endsAt, now)}.`
    return signIn.endingSoon
      ? { tone: 'warning', text: `Its ${provider} sign-in in Nexus ends soon: ${ends} Sign in again to start its clock over.` }
      : { tone: 'muted', text: `${since} ${ends}` }
  }

  if (signIn.kind === 'KeptAlive') return { tone: 'muted', text: `${since} Nexus keeps it alive.` }
  return { tone: 'muted', text: `${since} It stays signed in.` }
}

/** "Reads the account …1234.", or null for a sign-in that names none. */
export const accountsLine = (accounts: string[]) =>
  accounts.length === 0 ? null : `Reads the ${accounts.length === 1 ? 'account' : 'accounts'} ${list(accounts)}.`

/** Whether a card offers Sign in again: once a sign-in has ended, and early for a fixed clock. */
export const offersSignIn = (signIn: SourceSignIn | null) => signIn !== null && (signIn.ended || signIn.kind === 'FixedClock')

/** What a chart says of a source whose sign-in ended: when its data last arrived, and when the sign-in ended. */
export function staleNote(source: Source, signIn: SourceSignIn): string {
  const updated = source.syncedAt ? `This data was last updated ${when(source.syncedAt)}.` : 'No rows of this data have arrived.'
  return `${updated} Its ${signIn.provider} sign-in ended${signIn.endedAt ? ` ${when(signIn.endedAt)}` : ''}.`
}

const RENEWING = 'scry-renewing'

/** Notes, before leaving for Nexus, the connection being signed in again, so coming back can say so. */
export function rememberRenewal(connectionId: number) {
  try {
    sessionStorage.setItem(RENEWING, String(connectionId))
  } catch {
    // Without storage, coming back says only that Nexus connected.
  }
}

/** Whether coming back with `connection` finishes a renewal this browser started. */
export function finishesRenewal(connection: string | null) {
  try {
    return connection !== null && sessionStorage.getItem(RENEWING) === connection
  } catch {
    return false
  }
}

export function forgetRenewal() {
  try {
    sessionStorage.removeItem(RENEWING)
  } catch {
    // Nothing was kept.
  }
}
