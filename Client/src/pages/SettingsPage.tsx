import { InstanceSection } from '../components/InstanceSection'
import { useSession } from '../session'

/** Scry's own settings, for admins: its addresses, mail, and database. Each workspace's settings are on its own page. */
export function SettingsPage() {
  const { me } = useSession()

  return (
    <div className="page">
      <h1>Settings</h1>
      {me?.isAdmin ? <InstanceSection /> : <p className="muted">Only admins change Scry&apos;s addresses, mail, and database.</p>}
    </div>
  )
}
