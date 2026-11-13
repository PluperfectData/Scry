import type { ChartKind } from './dashboard'

type ECharts = typeof import('echarts/core')

type Installer = Exclude<Parameters<ECharts['use']>[0], unknown[]>

// One dynamic import per part, so the bundler gives every chart type and component a chunk of its own.
const PARTS = {
  bar: () => import('echarts/lib/chart/bar/install.js'),
  pictorialBar: () => import('echarts/lib/chart/bar/installPictorialBar.js'),
  boxplot: () => import('echarts/lib/chart/boxplot/install.js'),
  candlestick: () => import('echarts/lib/chart/candlestick/install.js'),
  chord: () => import('echarts/lib/chart/chord/install.js'),
  effectScatter: () => import('echarts/lib/chart/effectScatter/install.js'),
  funnel: () => import('echarts/lib/chart/funnel/install.js'),
  gauge: () => import('echarts/lib/chart/gauge/install.js'),
  graph: () => import('echarts/lib/chart/graph/install.js'),
  heatmap: () => import('echarts/lib/chart/heatmap/install.js'),
  line: () => import('echarts/lib/chart/line/install.js'),
  lines: () => import('echarts/lib/chart/lines/install.js'),
  map: () => import('echarts/lib/chart/map/install.js'),
  parallelChart: () => import('echarts/lib/chart/parallel/install.js'),
  pie: () => import('echarts/lib/chart/pie/install.js'),
  radarChart: () => import('echarts/lib/chart/radar/install.js'),
  sankey: () => import('echarts/lib/chart/sankey/install.js'),
  scatter: () => import('echarts/lib/chart/scatter/install.js'),
  sunburst: () => import('echarts/lib/chart/sunburst/install.js'),
  themeRiver: () => import('echarts/lib/chart/themeRiver/install.js'),
  tree: () => import('echarts/lib/chart/tree/install.js'),
  treemap: () => import('echarts/lib/chart/treemap/install.js'),
  geo: () => import('echarts/lib/component/geo/install.js'),
  grid: () => import('echarts/lib/component/grid/install.js'),
  legend: () => import('echarts/lib/component/legend/install.js'),
  parallelAxes: () => import('echarts/lib/component/parallel/install.js'),
  radarAxes: () => import('echarts/lib/component/radar/install.js'),
  singleAxis: () => import('echarts/lib/component/singleAxis/install.js'),
  tooltip: () => import('echarts/lib/component/tooltip/install.js'),
  visualMap: () => import('echarts/lib/component/visualMap/install.js'),
} satisfies Record<string, () => Promise<{ install: Installer }>>

type Part = keyof typeof PARTS

/** The parts each chart type draws with. A table draws with none. */
const NEEDS = {
  bar: ['bar', 'grid', 'tooltip'],
  stacked: ['bar', 'grid', 'tooltip', 'legend'],
  histogram: ['bar', 'grid', 'tooltip'],
  pictorial: ['pictorialBar', 'grid', 'tooltip'],
  line: ['line', 'grid', 'tooltip'],
  area: ['line', 'grid', 'tooltip'],
  themeriver: ['themeRiver', 'singleAxis', 'tooltip', 'legend'],
  pie: ['pie', 'tooltip'],
  funnel: ['funnel', 'tooltip'],
  scatter: ['scatter', 'grid', 'tooltip'],
  ripple: ['effectScatter', 'grid', 'tooltip'],
  heatmap: ['heatmap', 'grid', 'tooltip', 'visualMap'],
  boxplot: ['boxplot', 'grid', 'tooltip'],
  parallel: ['parallelChart', 'parallelAxes'],
  radar: ['radarChart', 'radarAxes', 'tooltip', 'legend'],
  treemap: ['treemap', 'tooltip'],
  sunburst: ['sunburst', 'tooltip'],
  tree: ['tree', 'tooltip'],
  sankey: ['sankey', 'tooltip'],
  graph: ['graph', 'tooltip'],
  chord: ['chord', 'tooltip'],
  map: ['map', 'geo', 'tooltip', 'visualMap'],
  flows: ['lines', 'geo'],
  gauge: ['gauge'],
  candlestick: ['candlestick', 'grid', 'tooltip'],
} satisfies Record<Exclude<ChartKind, 'table'>, Part[]>

export type DrawnKind = keyof typeof NEEDS

let core: Promise<ECharts> | undefined

/** ECharts' core with its canvas renderer, loaded once, the first time anything needs it. */
export function echartsCore(): Promise<ECharts> {
  core ??= Promise.all([import('echarts/core'), import('echarts/lib/renderer/installCanvasRenderer.js')]).then(
    ([echarts, canvas]) => {
      echarts.use(canvas.install)
      return echarts
    },
  )
  return core
}

/** ECharts, with everything one chart type draws with installed. */
export async function echartsFor(kind: DrawnKind): Promise<ECharts> {
  const [echarts, parts] = await Promise.all([echartsCore(), Promise.all(NEEDS[kind].map((part) => PARTS[part]()))])
  echarts.use(parts.map((part) => part.install))
  return echarts
}
