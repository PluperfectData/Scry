import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { createDashboard, deleteDashboard, listDashboards, type DashboardSummary } from '../api'

export function DashboardsPage() {
  const navigate = useNavigate()
  const [dashboards, setDashboards] = useState<DashboardSummary[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listDashboards()
      .then(setDashboards)
      .catch((e: Error) => setError(e.message))
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    try {
      const created = await createDashboard(name)
      navigate(`/dashboards/${created.id}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function remove(dashboard: DashboardSummary) {
    try {
      await deleteDashboard(dashboard.id)
      setDashboards((list) => list?.filter((d) => d.id !== dashboard.id) ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <h1>Dashboards</h1>

      <form className="form" onSubmit={create}>
        <label>
          New dashboard
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales" required maxLength={200} />
        </label>
        <button type="submit">Create</button>
      </form>

      {error && <p className="error">{error}</p>}

      {dashboards === null ? (
        !error && <p className="muted">Loading…</p>
      ) : dashboards.length === 0 ? (
        <p className="muted">No dashboards yet.</p>
      ) : (
        <ul className="list">
          {dashboards.map((dashboard) => (
            <li key={dashboard.id}>
              <Link to={`/dashboards/${dashboard.id}`}>{dashboard.name}</Link>
              <button type="button" className="quiet" onClick={() => remove(dashboard)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
