import { useEffect, useRef } from 'react'
import { BarChart, CandlestickChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  CandlestickChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
])

/** An ECharts chart that fills its container and redraws when the container resizes. */
export function Chart({ option }: { option: echarts.EChartsCoreOption }) {
  const element = useRef<HTMLDivElement>(null)
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null)

  useEffect(() => {
    const node = element.current!
    const instance = echarts.init(node)
    chart.current = instance
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(node)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={element} className="chart" />
}
