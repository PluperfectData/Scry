import { useEffect, useMemo, useState } from 'react'
import { getCandles, getPoints, getRows, getSeries, type Rows, type Series } from '../api'
import { candlestickOption, scatterOption, seriesOption } from '../chartOptions'
import type { Widget, WidgetSettings } from '../dashboard'
import { useTheme } from '../theme'
import { Chart } from './Chart'
import { TableView } from './TableView'

function load(widget: WidgetSettings): Promise<Series | Rows> {
  switch (widget.kind) {
    case 'line':
    case 'bar':
    case 'pie':
      return getSeries(widget.sourceId, widget.x, widget.y, widget.aggregate)
    case 'scatter':
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
    switch (widget.kind) {
      case 'scatter':
        return scatterOption(data, theme)
      case 'candlestick':
        return candlestickOption(data, theme)
      case 'table':
        return null
      default:
        return seriesOption(widget.kind, data, theme)
    }
  }, [data, theme, widget.kind])

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
        <Chart option={option} />
      ) : null}
      {data?.truncated && (
        <p className="muted">{'values' in data ? 'Showing the first 1,000 rows.' : 'Showing the first 10,000 points.'}</p>
      )}
    </section>
  )
}
