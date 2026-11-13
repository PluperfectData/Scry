import { useEffect, useRef } from 'react'
import { BarChart, BoxplotChart, CandlestickChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  BoxplotChart,
  CandlestickChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
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
