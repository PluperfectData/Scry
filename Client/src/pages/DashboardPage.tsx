import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Responsive, useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { Link, useParams } from 'react-router'
import {
  NUMERIC_TYPES,
  TIME_TYPES,
  getDashboard,
  listSources,
  saveDashboard,
  type Column,
  type Dashboard,
  type Source,
} from '../api'
import { ChartWidget } from '../components/ChartWidget'
import {
  AGGREGATES,
  BREAKPOINTS,
  CHART_KINDS,
  CHART_LABELS,
  COLS,
  DEFAULT_BINS,
  MAX_BINS,
  addWidget,
  removeWidget,
  titleFor,
  toLayouts,
  type Aggregate,
  type ChartKind,
  type Layouts,
  type Widget,
  type WidgetSettings,
} from '../dashboard'

const SAVE_DELAY_MS = 600

type SaveState = 'saved' | 'saving' | 'unsaved' | 'failed'

export function DashboardPage() {
  const id = Number(useParams().id)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
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
      setSaveState('saving')
      saveDashboard(dashboard)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('failed'))
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [dashboard])

  function change(update: (current: Dashboard) => Dashboard) {
    changed.current = true
    setSaveState('unsaved')
    setDashboard((current) => (current ? update(current) : current))
  }

  if (error) return <p className="error">{error}</p>
  if (!dashboard) return <p className="muted">Loading…</p>

  const add = (widget: Widget) =>
    change((current) => ({
      ...current,
      widgets: [...current.widgets, widget],
      layouts: addWidget(current.layouts, widget.id),
    }))

  const remove = (widgetId: string) =>
    change((current) => ({
      ...current,
      widgets: current.widgets.filter((widget) => widget.id !== widgetId),
      layouts: removeWidget(current.layouts, widgetId),
    }))

  return (
    <>
      <div className="title-row">
        <h1>{dashboard.name}</h1>
        <span className="muted" role="status">
          {saveState === 'saved' ? 'Saved' : saveState === 'failed' ? 'Not saved' : 'Saving…'}
        </span>
      </div>

      {sources.length === 0 ? (
        <p className="muted">
          <Link to="/sources">Upload a CSV file</Link> to chart it here.
        </p>
      ) : (
        <AddChartForm sources={sources} onAdd={add} />
      )}

      <DashboardGrid
        dashboard={dashboard}
        onLayoutsChange={(layouts) => change((current) => ({ ...current, layouts }))}
        onRemove={remove}
      />
    </>
  )
}

function DashboardGrid({
  dashboard,
  onLayoutsChange,
  onRemove,
}: {
  dashboard: Dashboard
  onLayoutsChange: (layouts: Layouts) => void
  onRemove: (widgetId: string) => void
}) {
  const { width, containerRef, mounted } = useContainerWidth()

  return (
    <div ref={containerRef} className="grid">
      {mounted && (
        <Responsive
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={dashboard.layouts}
          rowHeight={40}
          dragConfig={{ handle: '.widget-header', cancel: 'button' }}
          onLayoutChange={(_layout, all) => {
            const next = toLayouts(all)
            if (JSON.stringify(next) !== JSON.stringify(dashboard.layouts)) onLayoutsChange(next)
          }}
        >
          {dashboard.widgets.map((widget) => (
            <div key={widget.id}>
              <ChartWidget widget={widget} onRemove={() => onRemove(widget.id)} />
            </div>
          ))}
        </Responsive>
      )}
    </div>
  )
}

function ColumnSelect({
  label,
  value,
  onChange,
  columns,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  columns: Column[]
  placeholder: string
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">{placeholder}</option>
        {columns.map((column) => (
          <option key={column.name}>{column.name}</option>
        ))}
      </select>
    </label>
  )
}

const PRICES = [
  ['open', 'Open'],
  ['high', 'High'],
  ['low', 'Low'],
  ['close', 'Close'],
] as const

function AddChartForm({ sources, onAdd }: { sources: Source[]; onAdd: (widget: Widget) => void }) {
  const [kind, setKind] = useState<ChartKind>('bar')
  const [sourceId, setSourceId] = useState(sources[0].id)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [aggregate, setAggregate] = useState<Aggregate>('sum')
  const [columns, setColumns] = useState<string[]>([])

  const source = sources.find((s) => s.id === sourceId) ?? sources[0]
  const axes = source.columns.filter((column) => column.type !== 'Json' && column.type !== 'Binary')
  const numbers = source.columns.filter((column) => NUMERIC_TYPES.includes(column.type))
  const ordered = source.columns.filter((column) => NUMERIC_TYPES.includes(column.type) || TIME_TYPES.includes(column.type))
  const field = (name: string) => fields[name] ?? ''
  const setField = (name: string) => (value: string) => setFields((current) => ({ ...current, [name]: value }))
  const aggregated = kind === 'line' || kind === 'area' || kind === 'bar' || kind === 'pie'
  const crossed = kind === 'stacked' || kind === 'heatmap'

  function settings(): WidgetSettings | null {
    const x = field('x')
    const y = aggregate === 'count' ? null : field('y')
    switch (kind) {
      case 'line':
      case 'area':
      case 'bar':
      case 'pie':
        return x && y !== '' ? { kind, sourceId: source.id, x, y, aggregate } : null
      case 'stacked':
      case 'heatmap':
        return x && field('group') && y !== '' ? { kind, sourceId: source.id, x, group: field('group'), y, aggregate } : null
      case 'histogram': {
        const bins = Number(field('bins') || DEFAULT_BINS)
        return field('column') && Number.isInteger(bins) && bins >= 1 && bins <= MAX_BINS
          ? { kind, sourceId: source.id, column: field('column'), bins }
          : null
      }
      case 'boxplot':
        return field('value') ? { kind, sourceId: source.id, value: field('value'), group: field('group') || null } : null
      case 'scatter':
        return x && field('y') ? { kind, sourceId: source.id, x, y: field('y') } : null
      case 'candlestick':
        return x && PRICES.every(([name]) => field(name))
          ? { kind, sourceId: source.id, x, open: field('open'), high: field('high'), low: field('low'), close: field('close') }
          : null
      case 'table': {
        const order = source.columns.map((column) => column.name)
        return { kind, sourceId: source.id, columns: [...columns].sort((a, b) => order.indexOf(a) - order.indexOf(b)) }
      }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const chosen = settings()
    if (chosen) onAdd({ ...chosen, id: crypto.randomUUID(), title: titleFor(chosen) } as Widget)
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Chart
        <select value={kind} onChange={(e) => setKind(e.target.value as ChartKind)}>
          {CHART_KINDS.map((choice) => (
            <option key={choice} value={choice}>
              {CHART_LABELS[choice]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Source
        <select
          value={source.id}
          onChange={(e) => {
            setSourceId(Number(e.target.value))
            setFields({})
            setColumns([])
          }}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {(aggregated || crossed) && (
        <>
          <ColumnSelect
            label={kind === 'pie' ? 'Slices' : kind === 'heatmap' ? 'Columns' : 'X axis'}
            value={field('x')}
            onChange={setField('x')}
            columns={axes}
            placeholder="Choose a column"
          />
          {crossed && (
            <ColumnSelect
              label={kind === 'heatmap' ? 'Rows' : 'Stack by'}
              value={field('group')}
              onChange={setField('group')}
              columns={axes}
              placeholder="Choose a column"
            />
          )}
          <label>
            Aggregate
            <select value={aggregate} onChange={(e) => setAggregate(e.target.value as Aggregate)}>
              {AGGREGATES.map((choice) => (
                <option key={choice}>{choice}</option>
              ))}
            </select>
          </label>
          {aggregate !== 'count' && (
            <ColumnSelect
              label={kind === 'pie' ? 'Size' : kind === 'heatmap' ? 'Shade by' : 'Y axis'}
              value={field('y')}
              onChange={setField('y')}
              columns={numbers}
              placeholder="Choose a number column"
            />
          )}
        </>
      )}

      {kind === 'histogram' && (
        <>
          <ColumnSelect
            label="Column"
            value={field('column')}
            onChange={setField('column')}
            columns={numbers}
            placeholder="Choose a number column"
          />
          <label>
            Bins
            <input
              type="number"
              min={1}
              max={MAX_BINS}
              step={1}
              value={field('bins') || String(DEFAULT_BINS)}
              onChange={(e) => setField('bins')(e.target.value)}
              required
            />
          </label>
        </>
      )}

      {kind === 'boxplot' && (
        <>
          <ColumnSelect
            label="Value"
            value={field('value')}
            onChange={setField('value')}
            columns={numbers}
            placeholder="Choose a number column"
          />
          <label>
            Group by
            <select value={field('group')} onChange={(e) => setField('group')(e.target.value)}>
              <option value="">Nothing: one box</option>
              {axes.map((column) => (
                <option key={column.name}>{column.name}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {kind === 'scatter' && (
        <>
          <ColumnSelect
            label="X axis"
            value={field('x')}
            onChange={setField('x')}
            columns={ordered}
            placeholder="Choose a number or time column"
          />
          <ColumnSelect
            label="Y axis"
            value={field('y')}
            onChange={setField('y')}
            columns={numbers}
            placeholder="Choose a number column"
          />
        </>
      )}

      {kind === 'candlestick' && (
        <>
          <ColumnSelect label="X axis" value={field('x')} onChange={setField('x')} columns={axes} placeholder="Choose a column" />
          {PRICES.map(([name, label]) => (
            <ColumnSelect
              key={name}
              label={label}
              value={field(name)}
              onChange={setField(name)}
              columns={numbers}
              placeholder="Choose a number column"
            />
          ))}
        </>
      )}

      {kind === 'table' && (
        <fieldset className="column-picks">
          <legend>Columns, or none for all</legend>
          {source.columns.map((column) => (
            <label key={column.name} className="check">
              <input
                type="checkbox"
                checked={columns.includes(column.name)}
                onChange={(e) =>
                  setColumns((current) =>
                    e.target.checked ? [...current, column.name] : current.filter((name) => name !== column.name),
                  )
                }
              />
              {column.name}
            </label>
          ))}
        </fieldset>
      )}

      <button type="submit">{kind === 'table' ? 'Add table' : `Add ${CHART_LABELS[kind].toLowerCase()} chart`}</button>
    </form>
  )
}
