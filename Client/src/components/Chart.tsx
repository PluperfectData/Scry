import { useEffect, useRef, useState } from 'react'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { SLIDER, sliderRange } from '../chartOptions'
import { echartsFor, type DrawnKind } from '../echartsLoader'
import { ZoomSlider } from './ZoomSlider'

// How far above and below the x-axis slider a pointer still counts as over it.
const SLIDER_REACH = 4

const hasSlider = (option: EChartsCoreOption) =>
  Array.isArray(option.dataZoom) && option.dataZoom.some((zoom: { type?: string }) => zoom.type === 'slider')

/** The range the x-axis slider keeps, which ECharts fills in as values after each zoom. */
function keptRange(instance: EChartsType): string | null {
  const current = instance.getOption() as {
    dataZoom?: { startValue?: number; endValue?: number }[]
    xAxis?: { type?: string; data?: unknown[] }[]
  }
  const zoom = current.dataZoom?.[0]
  const axis = current.xAxis?.[0]
  return zoom?.startValue == null || zoom.endValue == null || !axis ? null : sliderRange(axis, zoom.startValue, zoom.endValue)
}

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
  const [range, setRange] = useState<string | null>(null)

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

  // The range shows while the pointer is over the x-axis slider, and stays while a press that began there drags.
  useEffect(() => {
    const instance = chart.current
    if (!ready || !instance || !hasSlider(option)) return
    const zr = instance.getZr()
    let over = false
    let pressed = false
    const show = () => setRange(over || pressed ? keptRange(instance) : null)
    const move = (event: { offsetY: number }) => {
      const top = instance.getHeight() - SLIDER.bottom - SLIDER.height
      over = event.offsetY >= top - SLIDER_REACH && event.offsetY <= top + SLIDER.height + SLIDER_REACH
      show()
    }
    const down = () => {
      pressed = over
      show()
    }
    const up = () => {
      pressed = false
      show()
    }
    const out = () => {
      over = false
      show()
    }

    zr.on('mousemove', move)
    zr.on('mousedown', down)
    zr.on('globalout', out)
    window.addEventListener('pointerup', up)
    instance.on('datazoom', show)
    return () => {
      zr.off('mousemove', move)
      zr.off('mousedown', down)
      zr.off('globalout', out)
      window.removeEventListener('pointerup', up)
      instance.off('datazoom', show)
      setRange(null)
    }
  }, [option, ready])

  const drawn = (
    <div className="chart-frame">
      <div ref={element} className="chart" />
      {range && <div className="slider-range">{range}</div>}
    </div>
  )

  if (!zoomOn) return drawn

  return (
    <div className="chart-zoomable">
      {drawn}
      <ZoomSlider zoom={zoom} onZoom={setZoom} />
    </div>
  )
}
