import type { SourceSignIn } from '../api'
import { accountsLine, signInStatus } from '../signIn'
import { LevelIcon } from './LevelIcon'

/** A Nexus source's sign-in: since when, when its provider ends it or how it is kept, and the accounts it reads. */
export function SignInStatus({ signIn }: { signIn: SourceSignIn }) {
  const { text, tone } = signInStatus(signIn)
  const accounts = accountsLine(signIn.accounts)
  return (
    <>
      {tone === 'muted' ? (
        <p className="muted">{text}</p>
      ) : (
        <p className={`${tone} with-icon`}>
          <LevelIcon level={tone === 'error' ? 'Error' : 'Warning'} />
          {text}
        </p>
      )}
      {accounts && <p className="muted">{accounts}</p>}
    </>
  )
}
