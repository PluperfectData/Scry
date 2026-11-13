import { useEffect, useRef, useState } from 'react'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { echartsFor, type DrawnKind } from '../echartsLoader'

/**
 * An ECharts chart that fills its container and redraws when the container resizes. ECharts and the parts this
 * chart type needs load on first use. Data ECharts refuses, such as a Sankey with a cycle, goes to `onError`.
 */
export function Chart({
  kind,
  option,
  onError,
}: {
  kind: DrawnKind
  option: EChartsCoreOption
  onError: (message: string) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const chart = useRef<EChartsType | null>(null)
  const [ready, setReady] = useState(false)

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

  return <div ref={element} className="chart" />
}
