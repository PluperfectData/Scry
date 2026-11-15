import { useEffect, useRef, useState } from 'react'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { REST_MS } from '../autoScroll'
import { GRID, SLIDER, sliderRange } from '../chartOptions'
import { echartsFor, type DrawnKind } from '../echartsLoader'
import type { ScrollPlan } from '../presentation'
import { ZoomSlider } from './ZoomSlider'

/** A full-screen chart's window along its x axis: the positions it slides over, in order, and how. */
export interface XSlide {
  positions: number[]
  plan: ScrollPlan
}

/**
 * What a presented chart drops: its zoom bar, its color slider's handles, and its legend's toggles. A chart that
 * slides keeps a hidden zoom to move its window with.
 */
function presented(option: EChartsCoreOption, sliding: boolean): EChartsCoreOption {
  const changes: EChartsCoreOption = {}
  if (option.dataZoom || sliding) changes.dataZoom = sliding ? [{ type: 'slider', show: false, xAxisIndex: 0 }] : []
  if (option.dataZoom && option.grid) changes.grid = { bottom: GRID.bottom }
  if (option.visualMap) changes.visualMap = { calculable: false }
  if (option.legend) changes.legend = { selectedMode: false }
  return changes
}

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
  presenting = false,
  slide = null,
}: {
  kind: DrawnKind
  option: EChartsCoreOption
  onError: (message: string) => void
  /** Adds a zoom slider beside the chart, which zooms its first series or its geo component. */
  zoomOn?: 'series' | 'geo'
  /** In full screen: no zoom bar, slider, or legend toggle, and the window along `slide` moves on its own. */
  presenting?: boolean
  slide?: XSlide | null
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

  // Runs again when full screen starts or ends, so leaving it brings back what presenting dropped.
  useEffect(() => {
    if (!ready) return
    try {
      chart.current?.setOption(option, { notMerge: true })
    } catch (e) {
      onError(`This chart cannot draw this data: ${(e as Error).message}`)
    }
  }, [option, onError, ready, presenting])

  // Runs after every new option as well, since one replaces the chart whole and starts it back at its own zoom.
  useEffect(() => {
    if (ready && zoomOn) chart.current?.setOption(zoomOn === 'geo' ? { geo: { zoom } } : { series: [{ zoom }] })
  }, [zoom, zoomOn, ready, option, presenting])

  // Steps the window one x value at a time, a window's worth every plan.seconds, resting at each end it turns or
  // jumps from. Looping has no seam to pass on an axis, so it jumps back without resting.
  useEffect(() => {
    const instance = chart.current
    if (!ready || !instance || !presenting) return
    const changes = presented(option, slide !== null)
    // ECharts refuses to replaceMerge a component it has not installed, and only charts that zoom install dataZoom.
    instance.setOption(changes, changes.dataZoom ? { replaceMerge: ['dataZoom'] } : {})
    if (!slide) return

    const { positions, plan } = slide
    const size = Math.min(plan.window, positions.length)
    const last = positions.length - size
    const show = (start: number) =>
      instance.setOption({ dataZoom: [{ startValue: positions[start], endValue: positions[start + size - 1] }] })
    const rest = plan.wrap === 'loop' ? 0 : REST_MS
    const stepMs = (plan.seconds * 1000) / size
    let start = 0
    let direction = 1
    show(start)
    if (last <= 0) return

    const advance = () => {
      if (direction > 0 && start === last) {
        if (plan.wrap === 'reverse') {
          direction = -1
          return stepMs
        }
        start = 0
        show(start)
        return rest + stepMs
      }
      if (direction < 0 && start === 0) {
        direction = 1
        return stepMs
      }
      start += direction
      show(start)
      return start === last || start === 0 ? rest + stepMs : stepMs
    }

    let timer = setTimeout(function tick() {
      timer = setTimeout(tick, advance())
    }, stepMs)
    return () => clearTimeout(timer)
  }, [option, presenting, ready, slide])

  // The range shows while the pointer is over the x-axis slider, and stays while a press that began there drags.
  useEffect(() => {
    const instance = chart.current
    if (!ready || !instance || presenting || !hasSlider(option)) return
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
  }, [option, presenting, ready])

  const drawn = (
    <div className="chart-frame">
      <div ref={element} className="chart" />
      {range && <div className="slider-range">{range}</div>}
    </div>
  )

  if (!zoomOn) return drawn

  // The wrapper stays in full screen: dropping it would make React discard the element ECharts draws into.
  return (
    <div className="chart-zoomable">
      {drawn}
      {!presenting && <ZoomSlider zoom={zoom} onZoom={setZoom} />}
    </div>
  )
}
