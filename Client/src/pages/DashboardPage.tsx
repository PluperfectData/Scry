import { useEffect, useRef, useState } from 'react'
import { Responsive, useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { Link, useParams } from 'react-router'
import { editDashboard, getDashboard, listSources, saveDashboard, type Dashboard, type Source } from '../api'
import { ChartForm } from '../components/ChartForm'
import { ChartWidget } from '../components/ChartWidget'
import { DashboardForm } from '../components/DashboardForm'
import { PencilIcon } from '../components/PencilIcon'
import { Slideout } from '../components/Slideout'
import { Tooltip } from '../components/Tooltip'
import {
  BREAKPOINTS,
  COLS,
  addWidget,
  removeWidget,
  titleFor,
  toLayouts,
  type Layouts,
  type Widget,
  type WidgetSettings,
} from '../dashboard'
import { useNotices } from '../notices'

const SAVE_DELAY_MS = 600
const SAVE_NOTICE = 'dashboard-save'

export function DashboardPage() {
  const id = Number(useParams().id)
  const { notify } = useNotices()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [error, setError] = useState<string | null>(null)
  // The chart open in the slideout: 'new' while adding one, null while the slideout is closed.
  const [editing, setEditing] = useState<Widget | 'new' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const changed = useRef(false)

  useEffect(() => {
    Promise.all([getDashboard(id), listSources()])
      .then(([loaded, list]) => {
        setDashboard(loaded)
        setSources(list)
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  // Saves once changes pause, so one drag sends one request.
  useEffect(() => {
    if (!dashboard || !changed.current) return
    const timer = setTimeout(() => {
      changed.current = false
      saveDashboard(dashboard)
        .then(() => notify('Saved', { tone: 'success', id: SAVE_NOTICE }))
        .catch((e: Error) => notify(`Not saved: ${e.message}`, { tone: 'error', seconds: null, id: SAVE_NOTICE }))
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [dashboard, notify])

  function change(update: (current: Dashboard) => Dashboard) {
    changed.current = true
    setDashboard((current) => (current ? update(current) : current))
  }

  if (error) return <p className="page error">{error}</p>
  if (!dashboard) return <p className="page muted">Loading…</p>

  function save(settings: WidgetSettings) {
    if (editing === 'new') {
      const widget = { ...settings, id: crypto.randomUUID(), title: titleFor(settings) } as Widget
      change((current) => ({
        ...current,
        widgets: [...current.widgets, widget],
        layouts: addWidget(current.layouts, widget.id),
      }))
    } else if (editing) {
      const widget = { ...settings, id: editing.id, title: titleFor(settings) } as Widget
      change((current) => ({ ...current, widgets: current.widgets.map((w) => (w.id === widget.id ? widget : w)) }))
    }
    setEditing(null)
  }

  // Saved on its own rather than through the autosave, which a name change would otherwise wait on.
  async function rename(name: string, isLanding: boolean) {
    const saved = await editDashboard(id, name, isLanding)
    setDashboard((current) => (current ? { ...current, name: saved.name, isLanding: saved.isLanding } : current))
    setRenaming(false)
  }

  const remove = (widgetId: string) =>
    change((current) => ({
      ...current,
      widgets: current.widgets.filter((widget) => widget.id !== widgetId),
      layouts: removeWidget(current.layouts, widgetId),
    }))

  return (
    <>
      <div className="page">
        <div className="title-row">
          <div className="title-name">
            <h1>{dashboard.name}</h1>
            <Tooltip label="Edit dashboard">
              <button type="button" className="widget-action" onClick={() => setRenaming(true)} aria-label={`Edit ${dashboard.name}`}>
                <PencilIcon />
              </button>
            </Tooltip>
          </div>
          {sources.length > 0 && (
            <div className="title-actions">
              <Tooltip label="Add chart">
                <button type="button" className="icon-button emblem" onClick={() => setEditing('new')}>
                  <span className="sr-only">Add chart</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </button>
              </Tooltip>
            </div>
          )}
        </div>

        {sources.length === 0 && (
          <p className="muted">
            <Link to="/sources">Upload a CSV file</Link> to chart it here.
          </p>
        )}
      </div>

      <DashboardGrid
        dashboard={dashboard}
        onLayoutsChange={(layouts) => change((current) => ({ ...current, layouts }))}
        onEdit={sources.length > 0 ? setEditing : undefined}
        onRemove={remove}
      />

      <Slideout open={editing !== null} title={editing === 'new' ? 'Add a chart' : 'Edit chart'} onClose={() => setEditing(null)}>
        <ChartForm
          sources={sources}
          widget={editing === 'new' ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      </Slideout>

      <Slideout open={renaming} title="Edit dashboard" onClose={() => setRenaming(false)}>
        {renaming && (
          <DashboardForm
            name={dashboard.name}
            isLanding={dashboard.isLanding}
            offerLanding
            submitLabel="Save"
            onSave={rename}
            onCancel={() => setRenaming(false)}
          />
        )}
      </Slideout>
    </>
  )
}

function DashboardGrid({
  dashboard,
  onLayoutsChange,
  onEdit,
  onRemove,
}: {
  dashboard: Dashboard
  onLayoutsChange: (layouts: Layouts) => void
  onEdit?: (widget: Widget) => void
  onRemove: (widgetId: string) => void
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const [dragging, setDragging] = useState(false)

  return (
    <div ref={containerRef} className="grid" data-dragging={dragging ? '' : undefined}>
      {mounted && (
        <Responsive
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={dashboard.layouts}
          rowHeight={40}
          containerPadding={[0, 0]}
          dragConfig={{ handle: '.widget-header', cancel: 'button' }}
          onDragStart={() => setDragging(true)}
          onDragStop={() => setDragging(false)}
          onLayoutChange={(_layout, all) => {
            const next = toLayouts(all)
            if (JSON.stringify(next) !== JSON.stringify(dashboard.layouts)) onLayoutsChange(next)
          }}
        >
          {dashboard.widgets.map((widget) => (
            <div key={widget.id}>
              <ChartWidget
                widget={widget}
                onEdit={onEdit && (() => onEdit(widget))}
                onRemove={() => onRemove(widget.id)}
              />
            </div>
          ))}
        </Responsive>
      )}
    </div>
  )
}
