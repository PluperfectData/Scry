import { useEffect, useMemo, useState } from 'react'
import {
  getBoxes,
  getCandles,
  getGroups,
  getHistogram,
  getLinks,
  getMeasures,
  getPoints,
  getRows,
  getSeries,
  getTotal,
  getTree,
  getValues,
  type Rows,
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
import type { Widget, WidgetSettings } from '../dashboard'
import type { DrawnKind } from '../echartsLoader'
import { loadMap } from '../maps'
import { useTheme } from '../theme'
import { Chart } from './Chart'
import { TableView } from './TableView'

/** A map's boundaries and its data load together; the data comes back once both have. */
const withMap = (map: Promise<void>, data: Promise<Series>) => Promise.all([map, data]).then(([, series]) => series)

function load(widget: WidgetSettings): Promise<Series | Rows> {
  switch (widget.kind) {
    case 'line':
    case 'area':
    case 'bar':
    case 'pictorial':
    case 'pie':
    case 'funnel':
      return getSeries(widget.sourceId, widget.x, widget.y, widget.aggregate)
    case 'map':
      return withMap(loadMap(widget.map), getSeries(widget.sourceId, widget.x, widget.y, widget.aggregate))
    case 'flows': {
      const { fromLon, fromLat, toLon, toLat } = widget
      return withMap(loadMap('world'), getValues(widget.sourceId, [fromLon, fromLat, toLon, toLat]))
    }
    case 'parallel':
      return getValues(widget.sourceId, widget.columns)
    case 'gauge':
      return getTotal(widget.sourceId, widget.y, widget.aggregate)
    case 'radar': {
      const { columns, group, aggregate } = widget
      return getMeasures(widget.sourceId, { columns, group, aggregate })
    }
    case 'treemap':
    case 'sunburst':
    case 'tree': {
      const { levels, y, aggregate } = widget
      return getTree(widget.sourceId, { levels, y, aggregate })
    }
    case 'sankey':
    case 'graph':
    case 'chord': {
      const { from, to, y, aggregate } = widget
      return getLinks(widget.sourceId, { from, to, y, aggregate })
    }
    case 'stacked':
    case 'heatmap':
    case 'themeriver': {
      const { x, group, y, aggregate } = widget
      return getGroups(widget.sourceId, { x, group, y, aggregate })
    }
    case 'histogram':
      return getHistogram(widget.sourceId, widget.column, widget.bins)
    case 'boxplot':
      return getBoxes(widget.sourceId, widget.value, widget.group)
    case 'scatter':
    case 'ripple':
      return getPoints(widget.sourceId, widget.x, widget.y)
    case 'candlestick': {
      const { x, open, high, low, close } = widget
      return getCandles(widget.sourceId, { x, open, high, low, close })
    }
    case 'table':
      return getRows(widget.sourceId, widget.columns)
    default:
      // Widgets are stored JSON, so one can carry a kind this client does not know.
      return Promise.reject(new Error('This chart type is not known here. Remove it and add it again.'))
  }
}

export function ChartWidget({ widget, onRemove }: { widget: Widget; onRemove: () => void }) {
  const { theme } = useTheme()
  const [data, setData] = useState<Series | Rows | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { id: _id, title: _title, ...rest } = widget
  const settingsKey = JSON.stringify(rest)

  // A widget is a new object after every dashboard save, so loading keys on its settings' JSON instead.
  const settings = useMemo(() => JSON.parse(settingsKey) as WidgetSettings, [settingsKey])

  useEffect(() => {
    let current = true
    load(settings)
      .then((loaded) => {
        if (current) setData(loaded)
      })
      .catch((e: Error) => {
        if (current) setError(e.message)
      })
    return () => {
      current = false
    }
  }, [settings])

  const option = useMemo(() => {
    if (!data || !('points' in data)) return null
    switch (settings.kind) {
      case 'pictorial':
        return pictorialOption(data, theme)
      case 'funnel':
        return funnelOption(data, theme)
      case 'map':
        return mapOption(data, settings.map, theme)
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
        return stackedOption(data, theme)
      case 'heatmap':
        return heatmapOption(data, theme)
      case 'themeriver':
        return themeRiverOption(data, theme)
      case 'histogram':
        return histogramOption(data, theme)
      case 'boxplot':
        return boxplotOption(data, theme)
      case 'scatter':
      case 'ripple':
        return scatterOption(data, theme, settings.kind === 'ripple')
      case 'candlestick':
        return candlestickOption(data, theme)
      case 'table':
        return null
      default:
        return seriesOption(settings.kind, data, theme)
    }
  }, [data, theme, settings])

  return (
    <section className="widget">
      <header className="widget-header">
        <h2>{widget.title}</h2>
        <button type="button" className="widget-remove" onClick={onRemove} aria-label={`Remove ${widget.title}`}>
          ×
        </button>
      </header>
      {error ? (
        <p className="error">{error}</p>
      ) : !data ? (
        <p className="muted">Loading…</p>
      ) : 'values' in data ? (
        <TableView rows={data} />
      ) : option ? (
        <Chart kind={settings.kind as DrawnKind} option={option} onError={setError} />
      ) : null}
      {data?.truncated && (
        <p className="muted">{'values' in data ? 'Showing the first 1,000 rows.' : 'Showing the first 10,000 points.'}</p>
      )}
    </section>
  )
}
