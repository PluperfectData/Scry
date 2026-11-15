import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { NUMERIC_TYPES, TIME_TYPES, type Column, type Source } from '../api'
import {
  AGGREGATES,
  AGGREGATE_NAMES,
  AUTO_SCALE,
  CHART_KINDS,
  CHART_LABELS,
  COUNT_SORT,
  DEFAULT_BINS,
  DEFAULT_PAGE_SIZE,
  MAPS,
  MAX_BINS,
  MAX_LEVELS,
  MAX_PIVOT_COLUMNS,
  MAX_VALUES,
  MIN_RADAR_MEASURES,
  PAGE_SIZES,
  SCALED_KINDS,
  listOf,
  titleFor,
  type Aggregate,
  type ChartKind,
  type AxisScale,
  type ColumnFormat,
  type Join,
  type JoinKind,
  type MapName,
  type Scales,
  type SortDirection,
  type Widget,
  type WidgetSettings,
} from '../dashboard'
import { FORMAT_LABELS, MAX_DECIMALS, currencies, formatsFor, startFormat, type FormatKind } from '../formats'
import { Help } from './Help'

/** A labeled control, with a question mark beside the label explaining a technical term in plain words. */
function Field({
  label,
  help,
  term = label.toLowerCase(),
  children,
}: {
  label: string
  help: string
  term?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="field">
      <span className="field-label">
        <label htmlFor={id}>{label}</label>
        <Help term={term}>{help}</Help>
      </span>
      {children(id)}
    </div>
  )
}

function ColumnSelect({
  label,
  value,
  onChange,
  columns,
  placeholder,
  disabled = false,
  help,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  columns: Column[]
  placeholder: string
  disabled?: boolean
  help?: string
}) {
  const select = (id?: string) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required disabled={disabled}>
      <option value="">{placeholder}</option>
      {columns.map((column) => (
        <option key={column.name}>{column.name}</option>
      ))}
    </select>
  )
  if (help) {
    return (
      <Field label={label} help={help}>
        {select}
      </Field>
    )
  }
  return (
    <label>
      {label}
      {select()}
    </label>
  )
}

/** The number column an aggregate combines, which a count does not need. */
function MeasureSelect({
  label,
  aggregate,
  value,
  onChange,
  columns,
}: {
  label: string
  aggregate: Aggregate
  value: string
  onChange: (value: string) => void
  columns: Column[]
}) {
  const counting = aggregate === 'count'
  return (
    <ColumnSelect
      label={label}
      value={counting ? '' : value}
      onChange={onChange}
      columns={columns}
      placeholder={counting ? 'Not needed to count rows' : 'Choose a number column'}
      disabled={counting}
    />
  )
}

const LOG_HELP =
  'Linear spaces equal steps evenly: 0, 10, 20. Log spaces each tenfold step evenly: 1, 10, 100, for values running from small to huge. Log needs every value above zero.'

/** An axis's bounds, blank to fit the data, and whether it is linear or logarithmic. */
function ScalePick({
  axis,
  field,
  setField,
}: {
  axis: 'x' | 'y'
  field: (name: string) => string
  setField: (name: string) => (value: string) => void
}) {
  const name = axis.toUpperCase()
  return (
    <div className="format-pick">
      <label>
        {name} min
        <input
          type="number"
          value={field(`${axis}Min`)}
          onChange={(e) => setField(`${axis}Min`)(e.target.value)}
          placeholder="Auto"
        />
      </label>
      <label>
        {name} max
        <input
          type="number"
          value={field(`${axis}Max`)}
          onChange={(e) => setField(`${axis}Max`)(e.target.value)}
          placeholder="Auto"
        />
      </label>
      <Field label={`${name} scale`} help={LOG_HELP}>
        {(id) => (
          <select
            id={id}
            value={field(`${axis}Scale`) || 'linear'}
            onChange={(e) => setField(`${axis}Scale`)(e.target.value === 'log' ? 'log' : '')}
          >
            <option value="linear">Linear</option>
            <option value="log">Log</option>
          </select>
        )}
      </Field>
    </div>
  )
}

const COMBINING ='Sum adds them up, Average averages them, Minimum and Maximum keep the smallest or largest, and Count counts the rows.'

/**
 * How rows combine into one value: those sharing every one of `keys`, or, when `keys` is null, every row. Keys not
 * chosen yet are left out of the explanation.
 */
function AggregateSelect({
  keys,
  value,
  onChange,
}: {
  keys: string[] | null
  value: Aggregate
  onChange: (value: Aggregate) => void
}) {
  const chosen = keys?.filter(Boolean) ?? []
  const grouping =
    keys === null
      ? 'Every row becomes one value.'
      : chosen.length > 0
        ? `Rows with the same ${listOf(chosen)} become one value.`
        : 'Rows with the same values in the columns above become one value.'
  return (
    <Field label="Aggregate" help={`${grouping} ${COMBINING}`}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as Aggregate)}>
          {AGGREGATES.map((choice) => (
            <option key={choice} value={choice}>
              {AGGREGATE_NAMES[choice]}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

const CHART_HELP: Record<ChartKind, string> = {
  bar: 'Bars whose heights compare a number across categories.',
  stacked: 'Bars split into a colored part per group, stacked to show a total and what makes it up.',
  pictorial: 'Bars built from stacked blocks rather than solid fills.',
  line: 'A line through the values in order, showing a number rise and fall.',
  area: 'A line with the space beneath it filled in.',
  themeriver: 'Streams that swell and narrow along a time or number axis, one per group.',
  pie: 'A circle cut into slices, each the share one category has of the whole.',
  funnel: 'Stages stacked widest to narrowest, showing a number shrink from step to step.',
  scatter: 'A dot per row, placed by two numbers, showing how they relate.',
  ripple: 'A scatter chart whose dots pulse.',
  heatmap: 'A grid of cells shaded by value, with a column and a row per category.',
  histogram: 'Bars counting how many rows fall into each range of a number.',
  boxplot:
    "A number's spread: a box around its middle half, a line at its median, and whiskers out to its smallest and largest values.",
  parallel: 'A line per row crossing an axis for each chosen number, to compare rows across many numbers at once.',
  radar: 'A web with a spoke per number and a shape per group.',
  treemap: 'Nested rectangles sized by value, for categories within categories.',
  sunburst: 'Rings within rings sized by value, for categories within categories.',
  tree: 'A branching diagram of categories within categories.',
  sankey: 'Bands flowing from one set of names to another, as wide as the amount between them.',
  graph: 'A dot per name and a line per link, laid out so linked names sit close together.',
  chord: 'Names around a circle, with ribbons across it as wide as the amount between each pair.',
  map: 'Regions of a world or US map, shaded by value.',
  flows: 'A curved line per row on a world map, from one place to another.',
  gauge: 'A dial showing one number against a scale.',
  candlestick: "A candle per row showing a price's open, high, low, and close.",
  table: "The source's rows and columns as they are.",
  pivot: 'A grid with a row per value of one column and a column per value of another, each cell combining the rows they share.',
}

const CURRENCIES = currencies()

/** How one column is written in a table, with the setting its format needs. */
function FormatPick({
  column,
  format,
  onChange,
}: {
  column: Column
  format: ColumnFormat | undefined
  onChange: (format: ColumnFormat | null) => void
}) {
  return (
    <div className="format-pick">
      <label>
        {column.name}
        <select
          value={format?.kind ?? ''}
          onChange={(e) => onChange(e.target.value ? startFormat(e.target.value as FormatKind) : null)}
        >
          <option value="">As stored</option>
          {formatsFor(column.type).map((kind) => (
            <option key={kind} value={kind}>
              {FORMAT_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      {format?.kind === 'money' && (
        <label>
          Currency
          <select value={format.currency} onChange={(e) => onChange({ kind: 'money', currency: e.target.value })}>
            {CURRENCIES.map(({ code, name }) => (
              <option key={code} value={code}>
                {code}: {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {(format?.kind === 'number' || format?.kind === 'percent') && (
        <label>
          Decimals
          <select
            value={format.decimals}
            onChange={(e) => onChange({ kind: format.kind, decimals: Number(e.target.value) })}
          >
            {Array.from({ length: MAX_DECIMALS + 1 }, (_, decimals) => (
              <option key={decimals} value={decimals}>
                {decimals}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

const PRICES = [
  ['open', 'Open'],
  ['high', 'High'],
  ['low', 'Low'],
  ['close', 'Close'],
] as const

const FLOW_ENDS = [
  ['fromLon', 'From longitude'],
  ['fromLat', 'From latitude'],
  ['toLon', 'To longitude'],
  ['toLat', 'To latitude'],
] as const

const X_LABELS: Partial<Record<ChartKind, string>> = { pie: 'Slices', funnel: 'Stages', heatmap: 'Columns', map: 'Regions' }

const GROUP_LABELS: Partial<Record<ChartKind, string>> = { stacked: 'Stack by', heatmap: 'Rows', themeriver: 'Streams' }

const Y_LABELS: Partial<Record<ChartKind, string>> = { pie: 'Size', funnel: 'Size', heatmap: 'Shade by', map: 'Shade by' }

/** A join as it is being chosen: the joined source, once picked, then the columns to match. */
interface JoinDraft {
  sourceId: number | null
  on: string
  to: string
  kind: JoinKind
}

const NO_JOIN: JoinDraft = { sourceId: null, on: '', to: '', kind: 'left' }

/** A source's columns named for it, as a join names them. */
const named = (source: Source): Column[] =>
  source.columns.map((column) => ({ ...column, name: `${source.name}.${column.name}` }))

/** The columns that can match rows in a join. */
const keys = (source: Source) => source.columns.filter((column) => column.type !== 'Json' && column.type !== 'Binary')

interface FormState {
  kind: ChartKind
  sourceId: number
  join: JoinDraft
  fields: Record<string, string>
  aggregate: Aggregate
  columns: string[]
  formats: Record<string, ColumnFormat>
}

/** Blank for a new chart, or the chart's own settings for one being edited. */
function startFrom(sources: Source[], widget: Widget | null): FormState {
  const blank: FormState = {
    kind: 'bar',
    sourceId: sources[0].id,
    join: NO_JOIN,
    fields: {},
    aggregate: 'sum',
    columns: [],
    formats: {},
  }
  if (!widget) return blank
  const aggregate = 'aggregate' in widget ? widget.aggregate : 'sum'
  const known = (id: number) => sources.some((source) => source.id === id)
  // A chart whose source, or joined source, has been deleted keeps its type and starts over on the first source.
  if (!known(widget.sourceId) || (widget.join && !known(widget.join.sourceId))) return { ...blank, kind: widget.kind, aggregate }

  const { id: _id, title: _title, kind: _kind, sourceId: _sourceId, ...settings } = widget
  const fields: Record<string, string> = {}
  for (const [name, value] of Object.entries(settings)) {
    if (name !== 'aggregate' && (typeof value === 'string' || typeof value === 'number')) fields[name] = String(value)
  }
  if ('levels' in widget) widget.levels.forEach((level, i) => (fields[`level${i + 1}`] = level))
  if (widget.kind === 'table') {
    fields.sort = widget.sort?.column ?? ''
    fields.direction = widget.sort?.direction ?? 'asc'
    fields.pageSize = widget.pageSize === null ? 'list' : String(widget.pageSize)
    if (widget.count) fields.count = 'on'
  }
  if (widget.scales) {
    for (const axis of ['x', 'y'] as const) {
      const { min, max, log } = widget.scales[axis]
      if (min !== null) fields[`${axis}Min`] = String(min)
      if (max !== null) fields[`${axis}Max`] = String(max)
      if (log) fields[`${axis}Scale`] = 'log'
    }
  }
  return {
    kind: widget.kind,
    sourceId: widget.sourceId,
    join: widget.join ?? NO_JOIN,
    fields,
    aggregate,
    columns: 'columns' in widget ? widget.columns : [],
    formats: widget.kind === 'table' ? widget.formats : {},
  }
}

/** Chooses a chart's settings: a new chart's when `widget` is null, or changes to `widget`'s. */
export function ChartForm({
  sources,
  widget,
  onSave,
  onCancel,
}: {
  sources: Source[]
  widget: Widget | null
  onSave: (settings: WidgetSettings) => void
  onCancel: () => void
}) {
  const [start] = useState(() => startFrom(sources, widget))
  const [kind, setKind] = useState<ChartKind>(start.kind)
  const [sourceId, setSourceId] = useState(start.sourceId)
  const [fields, setFields] = useState<Record<string, string>>(start.fields)
  const [aggregate, setAggregate] = useState<Aggregate>(start.aggregate)
  const [columns, setColumns] = useState<string[]>(start.columns)
  const [formats, setFormats] = useState<Record<string, ColumnFormat>>(start.formats)
  const [join, setJoin] = useState<JoinDraft>(start.join)

  const source = sources.find((s) => s.id === sourceId) ?? sources[0]
  const other = sources.find((s) => s.id === join.sourceId) ?? null
  const joined: Join | null =
    other && join.on && join.to ? { sourceId: other.id, on: join.on, to: join.to, kind: join.kind } : null
  const available = other ? [...named(source), ...named(other)] : source.columns

  // Choosing a source, or a source to join, renames or replaces every column, so the column choices made so far go.
  function restart(nextJoin: JoinDraft) {
    setJoin(nextJoin)
    setFields(({ name }): Record<string, string> => (name ? { name } : {}))
    setColumns([])
    setFormats({})
  }
  const axes = available.filter((column) => column.type !== 'Json' && column.type !== 'Binary')
  const numbers = available.filter((column) => NUMERIC_TYPES.includes(column.type))
  const ordered = available.filter((column) => NUMERIC_TYPES.includes(column.type) || TIME_TYPES.includes(column.type))
  const field = (name: string) => fields[name] ?? ''
  const setField = (name: string) => (value: string) => setFields((current) => ({ ...current, [name]: value }))

  /** An axis's scale, or null when a bound is not a number, the two are out of order, or a log scale reaches zero. */
  function scaleOf(axis: 'x' | 'y'): AxisScale | null {
    const bound = (name: string) => (field(name) === '' ? null : Number(field(name)))
    const min = bound(`${axis}Min`)
    const max = bound(`${axis}Max`)
    const log = field(`${axis}Scale`) === 'log'
    const set = [min, max].filter((value): value is number => value !== null)
    if (set.some((value) => !Number.isFinite(value) || (log && value <= 0))) return null
    if (min !== null && max !== null && min >= max) return null
    return { min, max, log }
  }

  const xColumn = available.find((column) => column.name === field('x'))
  // Line, area, bar, and scatter charts draw a number x column on a number axis; the rest place x by category.
  const numericX =
    (['line', 'area', 'bar', 'scatter', 'ripple'] as ChartKind[]).includes(kind) &&
    xColumn !== undefined &&
    NUMERIC_TYPES.includes(xColumn.type)
  const xScale = numericX ? scaleOf('x') : AUTO_SCALE
  const yScale = scaleOf('y')
  // Undefined while a scale is not valid, which keeps the chart from saving.
  const scales: Scales | null | undefined = SCALED_KINDS.includes(kind)
    ? xScale && yScale
      ? { x: xScale, y: yScale }
      : undefined
    : null
  const from = { sourceId: source.id, join: joined, name: field('name').trim() || null, scales: scales ?? null }
  const aggregated = (['line', 'area', 'bar', 'pictorial', 'pie', 'funnel', 'map'] as ChartKind[]).includes(kind)
  const crossed = kind === 'stacked' || kind === 'heatmap' || kind === 'themeriver'
  const tree = kind === 'treemap' || kind === 'sunburst' || kind === 'tree'
  const linked = kind === 'sankey' || kind === 'graph' || kind === 'chord'
  const scattered = kind === 'scatter' || kind === 'ripple'
  const order = available.map((column) => column.name)
  const tableColumns = [...columns].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  // The columns a table shows, which are the ones a format can be set for.
  const shown = available.filter((column) => tableColumns.length === 0 || tableColumns.includes(column.name))
  // A counted table has no source order, and sorts by its count or a column it shows.
  const counting = kind === 'table' && field('count') === 'on'
  const sortChoices = counting ? [COUNT_SORT, ...shown.map((column) => column.name)] : ['', ...axes.map((column) => column.name)]
  const sortChoice = sortChoices.includes(field('sort')) ? field('sort') : sortChoices[0]
  const sortDirection = (field('direction') || (sortChoice === COUNT_SORT ? 'desc' : 'asc')) as SortDirection
  // Levels count from the first; a blank one ends the path.
  const pickedLevels: string[] = []
  for (let n = 1; n <= MAX_LEVELS; n++) {
    const level = field(`level${n}`)
    if (!level) break
    pickedLevels.push(level)
  }

  function settings(): WidgetSettings | null {
    if ((other && !joined) || scales === undefined) return null
    const x = field('x')
    const y = aggregate === 'count' ? null : field('y')
    switch (kind) {
      case 'line':
      case 'area':
      case 'bar':
      case 'pictorial':
      case 'pie':
      case 'funnel':
        return x && y !== '' ? { kind, ...from, x, y, aggregate } : null
      case 'map':
        return x && y !== '' ? { kind, ...from, map: (field('map') || 'world') as MapName, x, y, aggregate } : null
      case 'sankey':
      case 'graph':
      case 'chord':
        return field('from') && field('to') && y !== ''
          ? { kind, ...from, from: field('from'), to: field('to'), y, aggregate }
          : null
      case 'parallel': {
        const chosen = columns.filter((name) => numbers.some((column) => column.name === name))
        return chosen.length >= 2 && chosen.length <= MAX_VALUES ? { kind, ...from, columns: chosen } : null
      }
      case 'flows':
        return FLOW_ENDS.every(([name]) => field(name))
          ? {
              kind,
              ...from,
              fromLon: field('fromLon'),
              fromLat: field('fromLat'),
              toLon: field('toLon'),
              toLat: field('toLat'),
            }
          : null
      case 'gauge': {
        const max = field('max') === '' ? null : Number(field('max'))
        return y !== '' && (max === null || Number.isFinite(max)) ? { kind, ...from, y, aggregate, max } : null
      }
      case 'radar': {
        const measures = columns.filter((name) => numbers.some((column) => column.name === name))
        return measures.length >= MIN_RADAR_MEASURES
          ? { kind, ...from, columns: measures, group: field('group') || null, aggregate }
          : null
      }
      case 'treemap':
      case 'sunburst':
      case 'tree':
        return pickedLevels.length > 0 && y !== '' ? { kind, ...from, levels: pickedLevels, y, aggregate } : null
      case 'stacked':
      case 'heatmap':
      case 'themeriver':
        return x && field('group') && y !== '' ? { kind, ...from, x, group: field('group'), y, aggregate } : null
      case 'pivot':
        return field('row') && field('column') && y !== ''
          ? { kind, ...from, row: field('row'), column: field('column'), y, aggregate }
          : null
      case 'histogram': {
        const bins = Number(field('bins') || DEFAULT_BINS)
        return field('column') && Number.isInteger(bins) && bins >= 1 && bins <= MAX_BINS
          ? { kind, ...from, column: field('column'), bins }
          : null
      }
      case 'boxplot':
        return field('value') ? { kind, ...from, value: field('value'), group: field('group') || null } : null
      case 'scatter':
      case 'ripple':
        return x && field('y') ? { kind, ...from, x, y: field('y') } : null
      case 'candlestick':
        return x && PRICES.every(([name]) => field(name))
          ? { kind, ...from, x, open: field('open'), high: field('high'), low: field('low'), close: field('close') }
          : null
      case 'table': {
        const pageSize = field('pageSize') || String(DEFAULT_PAGE_SIZE)
        return {
          kind,
          ...from,
          columns: tableColumns,
          sort: sortChoice ? { column: sortChoice, direction: sortDirection } : null,
          pageSize: pageSize === 'list' ? null : Number(pageSize),
          count: counting,
          formats: Object.fromEntries(
            shown.flatMap((column) => {
              const format = formats[column.name]
              return format && formatsFor(column.type).includes(format.kind) ? [[column.name, format]] : []
            }),
          ),
        }
      }
    }
  }

  const chosen = settings()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (chosen) onSave(chosen)
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Chart" help={CHART_HELP[kind]} term={`${CHART_LABELS[kind].toLowerCase()} charts`}>
        {(id) => (
          <select
            id={id}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ChartKind)
              setColumns([])
            }}
          >
            {CHART_KINDS.map((choice) => (
              <option key={choice} value={choice}>
                {CHART_LABELS[choice]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label>
        Source
        <select
          value={source.id}
          onChange={(e) => {
            setSourceId(Number(e.target.value))
            restart(NO_JOIN)
          }}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {sources.length > 1 && (
        <Field
          label="Join"
          help={`Brings in another source's columns beside ${source.name}'s, pairing up rows wherever a column of each holds the same value.`}
        >
          {(id) => (
            <select
              id={id}
              value={join.sourceId ?? ''}
              onChange={(e) => restart({ ...NO_JOIN, sourceId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">None</option>
              {sources
                .filter((s) => s.id !== source.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
      )}
      {other && (
        <>
          <ColumnSelect
            label="Join on"
            value={join.on}
            onChange={(on) => setJoin({ ...join, on })}
            columns={keys(source)}
            placeholder={`Choose a ${source.name} column`}
            help={`A row of ${source.name} pairs with a row of ${other.name} where this column holds the same value as the one chosen under Equals.`}
          />
          <ColumnSelect
            label="Equals"
            value={join.to}
            onChange={(to) => setJoin({ ...join, to })}
            columns={keys(other)}
            placeholder={`Choose a ${other.name} column`}
          />
          <Field
            label="Join type"
            help={`Which rows stay when they find no pair. Inner keeps only the rows that pair up. Left keeps every ${source.name} row, Right keeps every ${other.name} row, and Full keeps every row of both.`}
          >
            {(id) => (
              <select id={id} value={join.kind} onChange={(e) => setJoin({ ...join, kind: e.target.value as JoinKind })}>
                <option value="inner">Inner</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="full">Full</option>
              </select>
            )}
          </Field>
        </>
      )}

      {kind === 'pivot' && (
        <>
          <ColumnSelect label="Rows" value={field('row')} onChange={setField('row')} columns={axes} placeholder="Choose a column" />
          <ColumnSelect
            label="Columns"
            value={field('column')}
            onChange={setField('column')}
            columns={axes}
            placeholder="Choose a column"
            help={`Each value of this column gets a column of its own. Past the ${MAX_PIVOT_COLUMNS} largest, the rest share one named Other.`}
          />
          <MeasureSelect label="Value" aggregate={aggregate} value={field('y')} onChange={setField('y')} columns={numbers} />
          <AggregateSelect keys={[field('row'), field('column')]} value={aggregate} onChange={setAggregate} />
        </>
      )}

      {(aggregated || crossed) && (
        <>
          {kind === 'map' && (
            <>
              <label>
                Map
                <select value={field('map') || 'world'} onChange={(e) => setField('map')(e.target.value)}>
                  {(Object.keys(MAPS) as MapName[]).map((name) => (
                    <option key={name} value={name}>
                      {MAPS[name]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted hint">
                Region names must match the map's, such as United States of America, United Kingdom, or California.
              </p>
            </>
          )}
          <ColumnSelect
            label={X_LABELS[kind] ?? 'X axis'}
            value={field('x')}
            onChange={setField('x')}
            columns={kind === 'themeriver' ? ordered : axes}
            placeholder={kind === 'themeriver' ? 'Choose a number or time column' : 'Choose a column'}
          />
          {crossed && (
            <ColumnSelect
              label={GROUP_LABELS[kind] ?? 'Group by'}
              value={field('group')}
              onChange={setField('group')}
              columns={axes}
              placeholder="Choose a column"
            />
          )}
          <MeasureSelect
            label={Y_LABELS[kind] ?? 'Y axis'}
            aggregate={aggregate}
            value={field('y')}
            onChange={setField('y')}
            columns={numbers}
          />
          <AggregateSelect
            keys={crossed ? [field('x'), field('group')] : [field('x')]}
            value={aggregate}
            onChange={setAggregate}
          />
        </>
      )}

      {kind === 'histogram' && (
        <>
          <ColumnSelect
            label="Column"
            value={field('column')}
            onChange={setField('column')}
            columns={numbers}
            placeholder="Choose a number column"
          />
          <Field
            label="Bins"
            help="How many equal-width ranges the values are split into. Each bar counts the rows that fall in its range."
          >
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                max={MAX_BINS}
                step={1}
                value={field('bins') || String(DEFAULT_BINS)}
                onChange={(e) => setField('bins')(e.target.value)}
                required
              />
            )}
          </Field>
        </>
      )}

      {kind === 'boxplot' && (
        <>
          <ColumnSelect
            label="Value"
            value={field('value')}
            onChange={setField('value')}
            columns={numbers}
            placeholder="Choose a number column"
          />
          <label>
            Group by
            <select value={field('group')} onChange={(e) => setField('group')(e.target.value)}>
              <option value="">Nothing: one box</option>
              {axes.map((column) => (
                <option key={column.name}>{column.name}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {linked && (
        <>
          <ColumnSelect label="From" value={field('from')} onChange={setField('from')} columns={axes} placeholder="Choose a column" />
          <ColumnSelect label="To" value={field('to')} onChange={setField('to')} columns={axes} placeholder="Choose a column" />
          <MeasureSelect label="Weight" aggregate={aggregate} value={field('y')} onChange={setField('y')} columns={numbers} />
          <AggregateSelect keys={[field('from'), field('to')]} value={aggregate} onChange={setAggregate} />
        </>
      )}

      {kind === 'parallel' && (
        <fieldset className="column-picks">
          <legend>Axes: 2 to {MAX_VALUES} number columns</legend>
          {numbers.map((column) => (
            <label key={column.name} className="check">
              <input
                type="checkbox"
                checked={columns.includes(column.name)}
                onChange={(e) =>
                  setColumns((current) =>
                    e.target.checked ? [...current, column.name] : current.filter((name) => name !== column.name),
                  )
                }
              />
              {column.name}
            </label>
          ))}
        </fieldset>
      )}

      {kind === 'flows' &&
        FLOW_ENDS.map(([name, label]) => (
          <ColumnSelect
            key={name}
            label={label}
            value={field(name)}
            onChange={setField(name)}
            columns={numbers}
            placeholder="Choose a number column"
          />
        ))}

      {scattered && (
        <>
          <ColumnSelect
            label="X axis"
            value={field('x')}
            onChange={setField('x')}
            columns={ordered}
            placeholder="Choose a number or time column"
          />
          <ColumnSelect
            label="Y axis"
            value={field('y')}
            onChange={setField('y')}
            columns={numbers}
            placeholder="Choose a number column"
          />
        </>
      )}

      {kind === 'candlestick' && (
        <>
          <ColumnSelect label="X axis" value={field('x')} onChange={setField('x')} columns={axes} placeholder="Choose a column" />
          {PRICES.map(([name, label]) => (
            <ColumnSelect
              key={name}
              label={label}
              value={field(name)}
              onChange={setField(name)}
              columns={numbers}
              placeholder="Choose a number column"
            />
          ))}
        </>
      )}

      {(kind === 'gauge' || tree) && (
        <>
          {tree &&
            Array.from({ length: Math.min(pickedLevels.length + 1, MAX_LEVELS) }, (_, i) => (
              <label key={i}>
                {i === 0 ? 'Level 1' : `Level ${i + 1}, optional`}
                <select
                  value={field(`level${i + 1}`)}
                  onChange={(e) => setField(`level${i + 1}`)(e.target.value)}
                  required={i === 0}
                >
                  <option value="">{i === 0 ? 'Choose a column' : 'None'}</option>
                  {axes
                    .filter((column) => !pickedLevels.slice(0, i).includes(column.name))
                    .map((column) => (
                      <option key={column.name}>{column.name}</option>
                    ))}
                </select>
              </label>
            ))}
          <MeasureSelect
            label={tree ? 'Size' : 'Value'}
            aggregate={aggregate}
            value={field('y')}
            onChange={setField('y')}
            columns={numbers}
          />
          <AggregateSelect keys={kind === 'gauge' ? null : pickedLevels} value={aggregate} onChange={setAggregate} />
          {kind === 'gauge' && (
            <label>
              Maximum, optional
              <input
                type="number"
                value={field('max')}
                onChange={(e) => setField('max')(e.target.value)}
                placeholder="Rounded up from the value"
              />
            </label>
          )}
        </>
      )}

      {kind === 'radar' && (
        <>
          <label>
            Group by
            <select value={field('group')} onChange={(e) => setField('group')(e.target.value)}>
              <option value="">Nothing: one shape</option>
              {axes.map((column) => (
                <option key={column.name}>{column.name}</option>
              ))}
            </select>
          </label>
          <fieldset className="column-picks">
            <legend>Spokes: at least {MIN_RADAR_MEASURES} number columns</legend>
            {numbers.map((column) => (
              <label key={column.name} className="check">
                <input
                  type="checkbox"
                  checked={columns.includes(column.name)}
                  onChange={(e) =>
                    setColumns((current) =>
                      e.target.checked ? [...current, column.name] : current.filter((name) => name !== column.name),
                    )
                  }
                />
                {column.name}
              </label>
            ))}
          </fieldset>
          <AggregateSelect keys={field('group') ? [field('group')] : null} value={aggregate} onChange={setAggregate} />
        </>
      )}

      {kind === 'table' && (
        <>
          <fieldset className="column-picks">
            <legend>Columns, or none for all</legend>
            {available.map((column) => (
              <label key={column.name} className="check">
                <input
                  type="checkbox"
                  checked={columns.includes(column.name)}
                  onChange={(e) =>
                    setColumns((current) =>
                      e.target.checked ? [...current, column.name] : current.filter((name) => name !== column.name),
                    )
                  }
                />
                {column.name}
              </label>
            ))}
          </fieldset>
          <Field
            label="Count"
            help="Rows that match in every shown column become one row, with a Count column saying how many there were. The most frequent come first unless the table sorts another way."
          >
            {(id) => (
              <input
                id={id}
                type="checkbox"
                checked={counting}
                onChange={(e) => {
                  setField('count')(e.target.checked ? 'on' : '')
                  setField('direction')('')
                }}
              />
            )}
          </Field>
          <label>
            Sort by
            <select value={sortChoice} onChange={(e) => setField('sort')(e.target.value)}>
              {sortChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice === '' ? 'Source order' : choice === COUNT_SORT ? 'Count' : choice}
                </option>
              ))}
            </select>
          </label>
          {sortChoice && (
            <label>
              Direction
              <select value={sortDirection} onChange={(e) => setField('direction')(e.target.value)}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          )}
          <label>
            Rows
            <select value={field('pageSize') || String(DEFAULT_PAGE_SIZE)} onChange={(e) => setField('pageSize')(e.target.value)}>
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  Pages of {size}
                </option>
              ))}
              <option value="list">One scrolling list</option>
            </select>
          </label>
          {shown.some((column) => formatsFor(column.type).length > 0) && (
            <fieldset className="column-formats">
              <legend>Formats</legend>
              {shown
                .filter((column) => formatsFor(column.type).length > 0)
                .map((column) => (
                  <FormatPick
                    key={column.name}
                    column={column}
                    format={formats[column.name]}
                    onChange={(format) =>
                      setFormats(({ [column.name]: _old, ...rest }) => (format ? { ...rest, [column.name]: format } : rest))
                    }
                  />
                ))}
            </fieldset>
          )}
        </>
      )}

      {SCALED_KINDS.includes(kind) && (
        <fieldset className="column-formats">
          <legend>Scale</legend>
          {numericX && <ScalePick axis="x" field={field} setField={setField} />}
          <ScalePick axis="y" field={field} setField={setField} />
          {scales === undefined && (
            <p className="error hint">Each minimum must be below its maximum, and a log scale's bounds above zero.</p>
          )}
        </fieldset>
      )}

      <label>
        Name
        <input
          value={field('name')}
          onChange={(e) => setField('name')(e.target.value)}
          placeholder={chosen ? titleFor({ ...chosen, name: null }) : 'Named from its settings'}
          maxLength={200}
        />
      </label>

      <div className="form-actions">
        <button type="submit" disabled={chosen === null}>
          {widget
            ? 'Save changes'
            : CHART_LABELS[kind].toLowerCase().endsWith('table')
              ? `Add ${CHART_LABELS[kind].toLowerCase()}`
              : `Add ${CHART_LABELS[kind].toLowerCase()} chart`}
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
