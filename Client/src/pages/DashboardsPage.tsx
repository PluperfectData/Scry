import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { createDashboard, deleteDashboard, editDashboard, listDashboards, type DashboardSummary } from '../api'
import { DashboardForm } from '../components/DashboardForm'
import { PencilIcon } from '../components/PencilIcon'
import { Slideout } from '../components/Slideout'
import { Tooltip } from '../components/Tooltip'
import type { PresentationSettings } from '../presentation'
import { useWorkspace } from '../workspace'

const charts = (count: number) => (count === 0 ? 'No charts' : count === 1 ? '1 chart' : `${count} charts`)

const byName = (a: DashboardSummary, b: DashboardSummary) => a.name.localeCompare(b.name)

/**
 * The workspace's dashboards. As the workspace's index, it opens the landing dashboard in its place when there is one.
 * A viewer opens them, and adds, edits, and deletes none.
 */
export function DashboardsPage({ openLanding = false }: { openLanding?: boolean }) {
  const navigate = useNavigate()
  const { base, canEdit } = useWorkspace()
  const [dashboards, setDashboards] = useState<DashboardSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<DashboardSummary | null>(null)

  useEffect(() => {
    listDashboards()
      .then((list) => {
        const landing = openLanding ? list.find((dashboard) => dashboard.isLanding) : undefined
        if (landing) navigate(`${base}/dashboards/${landing.id}`, { replace: true })
        else setDashboards(list)
      })
      .catch((e: Error) => setError(e.message))
  }, [navigate, openLanding, base])

  async function create(name: string) {
    const created = await createDashboard(name)
    navigate(`${base}/dashboards/${created.id}`)
  }

  async function edit(name: string, isLanding: boolean, presentation: PresentationSettings) {
    if (!editing) return
    const saved = await editDashboard(editing.id, name, isLanding, presentation)
    setDashboards((list) =>
      (list ?? [])
        .map((d) =>
          d.id === saved.id
            ? { ...d, name: saved.name, isLanding: saved.isLanding, presentation: saved.presentation }
            : saved.isLanding
              ? { ...d, isLanding: false }
              : d,
        )
        .sort(byName),
    )
    setEditing(null)
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
    <div className="page">
      <div className="title-row">
        <h1>Dashboards</h1>
        {canEdit && <div className="title-actions">
          <Tooltip label="Add dashboard">
            <button type="button" className="icon-button emblem" onClick={() => setAdding(true)}>
              <span className="sr-only">Add dashboard</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>
        </div>}
      </div>

      {error && <p className="error">{error}</p>}

      {dashboards === null ? (
        !error && <p className="muted">Loading…</p>
      ) : dashboards.length === 0 ? (
        <p className="muted">{canEdit ? 'No dashboards yet. Add one to start charting.' : 'No dashboards yet.'}</p>
      ) : (
        <ul className="list cards">
          {dashboards.map((dashboard) => (
            <li key={dashboard.id}>
              <div className="card-head">
                <h2>
                  <Link to={`${base}/dashboards/${dashboard.id}`}>{dashboard.name}</Link>
                </h2>
                {canEdit && <div className="card-actions">
                  <Tooltip label="Edit dashboard">
                    <button
                      type="button"
                      className="widget-action"
                      onClick={() => setEditing(dashboard)}
                      aria-label={`Edit ${dashboard.name}`}
                    >
                      <PencilIcon />
                    </button>
                  </Tooltip>
                  <Tooltip label="Delete dashboard">
                    <button
                      type="button"
                      className="widget-action"
                      onClick={() => remove(dashboard)}
                      aria-label={`Delete ${dashboard.name}`}
                    >
                      ×
                    </button>
                  </Tooltip>
                </div>}
              </div>
              <p className="muted">
                {charts(dashboard.chartCount)}
                {dashboard.isLanding && ' · Landing page'}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Slideout open={adding} title="Add a dashboard" onClose={() => setAdding(false)}>
        {adding && <DashboardForm editing={false} submitLabel="Create" onSave={(name) => create(name)} onCancel={() => setAdding(false)} />}
      </Slideout>

      <Slideout open={editing !== null} title="Edit dashboard" onClose={() => setEditing(null)}>
        {editing && (
          <DashboardForm
            key={editing.id}
            name={editing.name}
            isLanding={editing.isLanding}
            presentation={editing.presentation}
            editing
            submitLabel="Save"
            onSave={edit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Slideout>
    </div>
  )
}
