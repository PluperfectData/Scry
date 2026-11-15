import { useEffect, useRef, useState } from 'react'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { echartsFor, type DrawnKind } from '../echartsLoader'
import { ZoomSlider } from './ZoomSlider'

/**
 * An ECharts chart that fills its container and redraws when the container resizes. ECharts and the parts this
 * chart type needs load on first use. Data ECharts refuses, such as a Sankey with a cycle, goes to `onError`.
 */
export function Chart({
  kind,
  option,
  onError,
  zoomOn,
}: {
  kind: DrawnKind
  option: EChartsCoreOption
  onError: (message: string) => void
  /** Adds a zoom slider beside the chart, which zooms its first series or its geo component. */
  zoomOn?: 'series' | 'geo'
}) {
  const element = useRef<HTMLDivElement>(null)
  const chart = useRef<EChartsType | null>(null)
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const node = element.current!
    let observer: ResizeObserver | undefined
    let disposed = false

    echartsFor(kind)
      .then((echarts) => {
        if (disposed) return
        const instance = echarts.init(node)
        chart.current = instance
        observer = new ResizeObserver(() => instance.resize())
        observer.observe(node)
        setReady(true)
      })
      .catch((e: Error) => onError(`This chart did not load: ${e.message}`))

    return () => {
      disposed = true
      observer?.disconnect()
      chart.current?.dispose()
      chart.current = null
      setReady(false)
    }
  }, [kind, onError])

  useEffect(() => {
    if (!ready) return
    try {
      chart.current?.setOption(option, { notMerge: true })
    } catch (e) {
      onError(`This chart cannot draw this data: ${(e as Error).message}`)
    }
  }, [option, onError, ready])

  // Runs after every new option as well, since one replaces the chart whole and starts it back at its own zoom.
  useEffect(() => {
    if (ready && zoomOn) chart.current?.setOption(zoomOn === 'geo' ? { geo: { zoom } } : { series: [{ zoom }] })
  }, [zoom, zoomOn, ready, option])

  if (!zoomOn) return <div ref={element} className="chart" />

  return (
    <div className="chart-zoomable">
      <div ref={element} className="chart" />
      <ZoomSlider zoom={zoom} onZoom={setZoom} />
    </div>
  )
}
