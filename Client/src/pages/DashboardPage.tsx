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
import { useFullscreen } from '../fullscreen'
import { DEFAULT_PRESENTATION, PresentationContext, type PresentationSettings } from '../presentation'
import { useNotices } from '../notices'
import { useWorkspace } from '../workspace'

const SAVE_DELAY_MS = 600
const SAVE_NOTICE = 'dashboard-save'

export function DashboardPage() {
  const id = Number(useParams().id)
  const { base, canEdit } = useWorkspace()
  const { notify } = useNotices()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [error, setError] = useState<string | null>(null)
  // The chart open in the slideout: 'new' while adding one, null while the slideout is closed.
  const [editing, setEditing] = useState<Widget | 'new' | null>(null)
  const [renaming, setRenaming] = useState(false)
  // In full screen, and for a viewer, the dashboard is read only: its name and charts, with nothing to edit, move, or resize.
  const fullscreen = useFullscreen()
  const readOnly = fullscreen || !canEdit
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
  async function rename(name: string, isLanding: boolean, presentation: PresentationSettings) {
    const saved = await editDashboard(id, name, isLanding, presentation)
    setDashboard((current) =>
      current ? { ...current, name: saved.name, isLanding: saved.isLanding, presentation: saved.presentation } : current,
    )
    setRenaming(false)
  }

  const remove = (widgetId: string) =>
    change((current) => ({
      ...current,
      widgets: current.widgets.filter((widget) => widget.id !== widgetId),
      layouts: removeWidget(current.layouts, widgetId),
    }))

  const presentation = dashboard.presentation ?? DEFAULT_PRESENTATION
  const titled = !fullscreen || presentation.showTitle

  return (
    <>
      {(titled || sources.length === 0) && (
        <div className="page">
          {titled && (
            <div className="title-row">
              <div className="title-name">
                <h1>{dashboard.name}</h1>
                {!readOnly && (
                  <Tooltip label="Edit dashboard">
                    <button type="button" className="widget-action" onClick={() => setRenaming(true)} aria-label={`Edit ${dashboard.name}`}>
                      <PencilIcon />
                    </button>
                  </Tooltip>
                )}
              </div>
              {!readOnly && sources.length > 0 && (
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
          )}

          {sources.length === 0 &&
            (canEdit ? (
              <p className="muted">
                <Link to={`${base}/sources`}>Upload a CSV file</Link> to chart it here.
              </p>
            ) : (
              <p className="muted">This workspace has no sources to chart yet.</p>
            ))}
        </div>
      )}

      <PresentationContext.Provider value={fullscreen ? presentation : null}>
        <DashboardGrid
          dashboard={dashboard}
          sources={sources}
          onLayoutsChange={(layouts) => canEdit && change((current) => ({ ...current, layouts }))}
          onEdit={!readOnly && sources.length > 0 ? setEditing : undefined}
          onRemove={readOnly ? undefined : remove}
        />
      </PresentationContext.Provider>

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
            presentation={dashboard.presentation}
            editing
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
  sources,
  onLayoutsChange,
  onEdit,
  onRemove,
}: {
  dashboard: Dashboard
  sources: Source[]
  onLayoutsChange: (layouts: Layouts) => void
  onEdit?: (widget: Widget) => void
  /** Removes a chart; without it, the grid is read only, and no chart moves or resizes. */
  onRemove?: (widgetId: string) => void
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const [dragging, setDragging] = useState(false)
  const known = new Set(sources.map((source) => source.id))
  const gone = (widget: Widget) => !known.has(widget.sourceId) || (widget.join !== null && !known.has(widget.join.sourceId))

  return (
    <div
      ref={containerRef}
      className="grid"
      data-dragging={dragging ? '' : undefined}
      data-fixed={onRemove === undefined ? '' : undefined}
    >
      {mounted && (
        <Responsive
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={dashboard.layouts}
          rowHeight={40}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: onRemove !== undefined, handle: '.widget-header', cancel: 'button' }}
          resizeConfig={{ enabled: onRemove !== undefined }}
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
                sourceGone={gone(widget)}
                onEdit={onEdit && (() => onEdit(widget))}
                onRemove={onRemove && (() => onRemove(widget.id))}
              />
            </div>
          ))}
        </Responsive>
      )}
    </div>
  )
}
