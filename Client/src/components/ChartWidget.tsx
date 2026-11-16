import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getBoxes,
  getCandles,
  getGroups,
  getHistogram,
  getLinks,
  getMeasures,
  getPivot,
  getPoints,
  getSeries,
  getTotal,
  getTree,
  getValues,
  type Series,
} from '../api'
import {
  boxplotOption,
  candlestickOption,
  chordOption,
  flowsOption,
  funnelOption,
  gaugeOption,
  graphOption,
  heatmapOption,
  histogramOption,
  mapOption,
  parallelOption,
  pictorialOption,
  radarOption,
  sankeyOption,
  scatterOption,
  seriesOption,
  stackedOption,
  themeRiverOption,
  treeOption,
} from '../chartOptions'
import { measureName, type ChartKind, type Widget, type WidgetSettings } from '../dashboard'
import type { DrawnKind } from '../echartsLoader'
import { loadMap } from '../maps'
import { usePresentation, xPositions } from '../presentation'
import { useTheme } from '../theme'
import { Chart, type XSlide } from './Chart'
import { PivotView } from './PivotView'
import { TableView } from './TableView'
import { Tooltip } from './Tooltip'

/** A map's boundaries and its data load together; the data comes back once both have. */
const withMap = (map: Promise<void>, data: Promise<Series>) => Promise.all([map, data]).then(([, series]) => series)

function load(widget: Exclude<WidgetSettings, { kind: 'table' }>): Promise<Series> {
  switch (widget.kind) {
    case 'line':
    case 'area':
    case 'bar':
    case 'pictorial':
    case 'pie':
    case 'funnel':
      return getSeries(widget, widget.x, widget.y, widget.aggregate)
    case 'map':
      return withMap(loadMap(widget.map), getSeries(widget, widget.x, widget.y, widget.aggregate))
    case 'flows': {
      const { fromLon, fromLat, toLon, toLat } = widget
      return withMap(loadMap('world'), getValues(widget, [fromLon, fromLat, toLon, toLat]))
    }
    case 'parallel':
      return getValues(widget, widget.columns)
    case 'gauge':
      return getTotal(widget, widget.y, widget.aggregate)
    case 'radar': {
      const { columns, group, aggregate } = widget
      return getMeasures(widget, { columns, group, aggregate })
    }
    case 'treemap':
    case 'sunburst':
    case 'tree': {
      const { levels, y, aggregate } = widget
      return getTree(widget, { levels, y, aggregate })
    }
    case 'sankey':
    case 'graph':
    case 'chord': {
      const { from, to, y, aggregate } = widget
      return getLinks(widget, { from, to, y, aggregate })
    }
    case 'stacked':
    case 'heatmap':
    case 'themeriver': {
      const { x, group, y, aggregate } = widget
      return getGroups(widget, { x, group, y, aggregate })
    }
    case 'pivot': {
      const { row, column, y, aggregate } = widget
      return getPivot(widget, { row, column, y, aggregate })
    }
    case 'histogram':
      return getHistogram(widget, widget.column, widget.bins)
    case 'boxplot':
      return getBoxes(widget, widget.value, widget.group)
    case 'scatter':
    case 'ripple':
      return getPoints(widget, widget.x, widget.y)
    case 'candlestick': {
      const { x, open, high, low, close } = widget
      return getCandles(widget, { x, open, high, low, close })
    }
    default:
      // Widgets are stored JSON, so one can carry a kind this client does not know.
      return Promise.reject(new Error('This chart type is not known here. Remove it and add it again.'))
  }
}

/** The charts that zoom from a slider rather than the wheel, and the part of the option each zooms. */
const ZOOM_ON: Partial<Record<ChartKind, 'series' | 'geo'>> = { map: 'series', graph: 'series', flows: 'geo' }

interface Loaded {
  settingsKey: string
  data: Series | null
  error: string | null
}

/** A chart on a dashboard. `sourceGone` says its source, or the source it joins, was removed. */
export function ChartWidget({
  widget,
  sourceGone = false,
  onEdit,
  onRemove,
}: {
  widget: Widget
  sourceGone?: boolean
  onEdit?: () => void
  onRemove?: () => void
}) {
  const { theme } = useTheme()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const { id: _id, title: _title, ...rest } = widget
  const settingsKey = JSON.stringify(rest)

  // A widget is a new object after every dashboard save, so loading keys on its settings' JSON instead.
  const settings = useMemo(() => JSON.parse(settingsKey) as WidgetSettings, [settingsKey])

  // Data loaded for the chart's previous settings is dropped, since its new type may not be able to draw it.
  const current = loaded?.settingsKey === settingsKey ? loaded : null
  const data = current?.data ?? null
  const error = current?.error ?? null
  const setError = useCallback((message: string) => setLoaded({ settingsKey, data: null, error: message }), [settingsKey])
  const { presenting, plan } = usePresentation(settings.kind, settings.presentation)
  const slide = useMemo<XSlide | null>(
    () => (plan && data && settings.kind !== 'table' && settings.kind !== 'pivot' ? { positions: xPositions(settings.kind, data), plan } : null),
    [plan, data, settings.kind],
  )

  useEffect(() => {
    if (settings.kind === 'table' || sourceGone) return
    let live = true
    load(settings)
      .then((result) => {
        if (live) setLoaded({ settingsKey, data: result, error: null })
      })
      .catch((e: Error) => {
        if (live) setLoaded({ settingsKey, data: null, error: e.message })
      })
    return () => {
      live = false
    }
  }, [settings, settingsKey, sourceGone])

  const option = useMemo(() => {
    if (!data) return null
    switch (settings.kind) {
      case 'pictorial':
        return pictorialOption(data, theme, settings.scales)
      case 'funnel':
        return funnelOption(data, theme)
      case 'map':
        return mapOption(data, settings.map, theme, measureName(settings.aggregate, settings.y))
      case 'flows':
        return flowsOption(data, theme)
      case 'parallel':
        return parallelOption(data, settings.columns, theme)
      case 'gauge':
        return gaugeOption(data, settings.max, theme)
      case 'radar':
        return radarOption(data, settings.columns, theme)
      case 'treemap':
      case 'sunburst':
      case 'tree':
        return treeOption(settings.kind, data, theme)
      case 'sankey':
        return sankeyOption(data, theme)
      case 'graph':
        return graphOption(data, theme)
      case 'chord':
        return chordOption(data, theme)
      case 'stacked':
        return stackedOption(data, theme, settings.scales)
      case 'heatmap':
        return heatmapOption(data, theme)
      case 'themeriver':
        return themeRiverOption(data, theme)
      case 'histogram':
        return histogramOption(data, theme, settings.scales)
      case 'boxplot':
        return boxplotOption(data, theme, settings.scales)
      case 'scatter':
      case 'ripple':
        return scatterOption(data, theme, settings.scales, settings.kind === 'ripple')
      case 'candlestick':
        return candlestickOption(data, theme, settings.scales)
      case 'table':
      case 'pivot':
        return null
      default:
        return seriesOption(settings.kind, data, theme, settings.scales)
    }
  }, [data, theme, settings])

  return (
    <section className="widget">
      <header className="widget-header">
        <h2>{widget.title}</h2>
        <div className="widget-actions">
          {onEdit && (
            <Tooltip label="Edit chart">
              <button type="button" className="widget-action" onClick={onEdit} aria-label={`Edit ${widget.title}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </Tooltip>
          )}
          {onRemove && (
            <Tooltip label="Remove chart">
              <button type="button" className="widget-action" onClick={onRemove} aria-label={`Remove ${widget.title}`}>
                ×
              </button>
            </Tooltip>
          )}
        </div>
      </header>
      {sourceGone ? (
        <p className="error">Its source was removed.{onEdit && ' Edit this chart to pick another.'}</p>
      ) : settings.kind === 'table' ? (
        // Keyed on the settings, so an edit starts the table again from its default sort and first page.
        <TableView key={settingsKey} table={settings} presenting={presenting} plan={plan} />
      ) : error ? (
        <p className="error">{error}</p>
      ) : !data ? (
        <p className="muted">Loading…</p>
      ) : settings.kind === 'pivot' ? (
        <PivotView series={data} rowLabel={settings.row} presenting={presenting} plan={plan} />
      ) : option ? (
        <Chart
          kind={settings.kind as DrawnKind}
          option={option}
          onError={setError}
          zoomOn={ZOOM_ON[settings.kind]}
          presenting={presenting}
          slide={slide}
        />
      ) : null}
      {data?.truncated && <p className="muted">Showing the first 10,000 points.</p>}
    </section>
  )
}
