import type { Aggregate, Join, Layouts, TableSort, Widget } from './dashboard'

const baseUrl = import.meta.env.VITE_API_URL

export type ColumnType =
  | 'String'
  | 'Int64'
  | 'Decimal'
  | 'Float64'
  | 'Boolean'
  | 'Date'
  | 'Timestamp'
  | 'DateTime'
  | 'Time'
  | 'Json'
  | 'Binary'

export const NUMERIC_TYPES: readonly ColumnType[] = ['Int64', 'Decimal', 'Float64']

export const TIME_TYPES: readonly ColumnType[] = ['Date', 'Timestamp', 'DateTime']

export interface Column {
  name: string
  type: ColumnType
}

/** An uploaded file, with its `fileName`, or a database table, with the `connector` that reads it and its `stream` name there. */
export interface Source {
  id: number
  name: string
  fileName: string | null
  connector: string | null
  stream: string | null
  columns: Column[]
  rowCount: number
  syncedAt: string
}

/** One setting a Nexus connector asks for. */
export interface SettingField {
  name: string
  label: string
  kind: 'Text' | 'Secret' | 'Number' | 'Boolean' | 'Choice' | 'File'
  required: boolean
  choices: string[] | null
}

/** A Nexus connector a source can come from: CSV, or a database. */
export interface Connector {
  id: string
  name: string
  description: string
  fields: SettingField[]
}

/** A table a database offers, by its connector's name for it, such as `public.orders`. */
export interface DatabaseTable {
  name: string
  columns: number
}

export type Settings = Record<string, string | null>

/**
 * Chart points in x order: `[x, y]`, or `[x, open, close, low, high]` for candles. A time axis carries epoch
 * milliseconds in UTC.
 */
export interface Series {
  xType: 'value' | 'time' | 'category'
  points: (number | string | null)[][]
  truncated: boolean
}

/** A source's first rows, as text. */
/** One run of a source's rows as text, and how many rows the source holds. */
export interface Rows {
  columns: Column[]
  values: (string | null)[][]
  total: number
}

export interface RowsRequest {
  columns: string[]
  sort: TableSort | null
  count: boolean
  offset: number
  limit: number
}

export interface DashboardSummary {
  id: number
  name: string
  chartCount: number
  /** Whether the index opens this dashboard in place of the list. At most one does. */
  isLanding: boolean
  updatedAt: string
}

export interface Dashboard {
  id: number
  name: string
  layouts: Layouts
  widgets: Widget[]
  isLanding: boolean
  createdAt: string
  updatedAt: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init)
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: string; title?: string } | null
    throw new ApiError(response.status, problem?.detail ?? problem?.title ?? `The request failed (${response.status}).`)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export const listSources = () => request<Source[]>('/sources')

export const listConnectors = () => request<Connector[]>('/connectors')

/** Connects with the settings and lists the database's tables; nothing is kept. */
export const listTables = (connector: string, settings: Settings) =>
  request<DatabaseTable[]>('/databases/tables', json('POST', { connector, settings }))

/** Keeps the connection and adds each table as a source of the given name, copied into Scry. */
export const addDatabaseSources = (connector: string, settings: Settings, tables: { table: string; name: string }[]) =>
  request<Source[]>('/databases', json('POST', { connector, settings, tables }))

/** Copies a database table's source again. */
export const syncSource = (id: number) => request<Source>(`/sources/${id}/sync`, { method: 'POST' })

export function uploadSource(name: string, file: File, delimiter: string): Promise<Source> {
  const form = new FormData()
  form.append('name', name)
  form.append('file', file)
  if (delimiter) form.append('delimiter', delimiter)
  return request<Source>('/sources', { method: 'POST', body: form })
}

/** What a chart reads: its source, and the source joined to it, if any. A chart's own settings serve as one. */
export interface From {
  sourceId: number
  join: Join | null
}

/** Asks for a chart's data from one of the source's endpoints, adding the join when there is one. */
function read<T>(from: From, endpoint: string, query: URLSearchParams): Promise<T> {
  if (from.join) {
    query.set('join', String(from.join.sourceId))
    query.set('joinOn', from.join.on)
    query.set('joinTo', from.join.to)
    query.set('joinKind', from.join.kind)
  }
  const search = query.toString()
  return request<T>(`/sources/${from.sourceId}/${endpoint}${search ? `?${search}` : ''}`)
}

export function getSeries(from: From, x: string, y: string | null, aggregate: Aggregate): Promise<Series> {
  const query = new URLSearchParams({ x, aggregate })
  if (y) query.set('y', y)
  return read(from, 'series', query)
}

export function getPoints(from: From, x: string, y: string): Promise<Series> {
  return read(from, 'points', new URLSearchParams({ x, y }))
}

export function getCandles(
  from: From,
  prices: { x: string; open: string; high: string; low: string; close: string },
): Promise<Series> {
  return read(from, 'candles', new URLSearchParams(prices))
}

export function getGroups(
  from: From,
  settings: { x: string; group: string; y: string | null; aggregate: Aggregate },
): Promise<Series> {
  const query = new URLSearchParams({ x: settings.x, group: settings.group, aggregate: settings.aggregate })
  if (settings.y) query.set('y', settings.y)
  return read(from, 'groups', query)
}

export function getPivot(
  from: From,
  settings: { row: string; column: string; y: string | null; aggregate: Aggregate },
): Promise<Series> {
  const query = new URLSearchParams({ row: settings.row, column: settings.column, aggregate: settings.aggregate })
  if (settings.y) query.set('y', settings.y)
  return read(from, 'pivot', query)
}

export function getHistogram(from: From, column: string, bins: number): Promise<Series> {
  return read(from, 'histogram', new URLSearchParams({ column, bins: String(bins) }))
}

export function getBoxes(from: From, value: string, group: string | null): Promise<Series> {
  const query = new URLSearchParams({ value })
  if (group) query.set('group', group)
  return read(from, 'boxes', query)
}

export function getTotal(from: From, y: string | null, aggregate: Aggregate): Promise<Series> {
  const query = new URLSearchParams({ aggregate })
  if (y) query.set('y', y)
  return read(from, 'total', query)
}

export function getMeasures(
  from: From,
  settings: { columns: string[]; group: string | null; aggregate: Aggregate },
): Promise<Series> {
  const query = new URLSearchParams({ aggregate: settings.aggregate })
  for (const column of settings.columns) query.append('columns', column)
  if (settings.group) query.set('group', settings.group)
  return read(from, 'measures', query)
}

export function getTree(
  from: From,
  settings: { levels: string[]; y: string | null; aggregate: Aggregate },
): Promise<Series> {
  const query = new URLSearchParams({ aggregate: settings.aggregate })
  for (const level of settings.levels) query.append('levels', level)
  if (settings.y) query.set('y', settings.y)
  return read(from, 'tree', query)
}

export function getLinks(
  from: From,
  settings: { from: string; to: string; y: string | null; aggregate: Aggregate },
): Promise<Series> {
  const query = new URLSearchParams({ from: settings.from, to: settings.to, aggregate: settings.aggregate })
  if (settings.y) query.set('y', settings.y)
  return read(from, 'links', query)
}

export function getValues(from: From, columns: string[]): Promise<Series> {
  const query = new URLSearchParams()
  for (const column of columns) query.append('columns', column)
  return read(from, 'values', query)
}

export function getRows(from: From, { columns, sort, count, offset, limit }: RowsRequest): Promise<Rows> {
  const query = new URLSearchParams()
  for (const column of columns) query.append('columns', column)
  if (sort) {
    query.set('sort', sort.column)
    query.set('direction', sort.direction)
  }
  if (count) query.set('count', 'true')
  query.set('offset', String(offset))
  query.set('limit', String(limit))
  return read(from, 'rows', query)
}

export const listDashboards = () => request<DashboardSummary[]>('/dashboards')

export const createDashboard = (name: string) => request<Dashboard>('/dashboards', json('POST', { name }))

export const getDashboard = (id: number) => request<Dashboard>(`/dashboards/${id}`)

export function saveDashboard(dashboard: Pick<Dashboard, 'id' | 'name' | 'layouts' | 'widgets'>): Promise<Dashboard> {
  const { id, name, layouts, widgets } = dashboard
  return request<Dashboard>(`/dashboards/${id}`, json('PUT', { name, layouts, widgets }))
}

export const deleteDashboard = (id: number) => request<void>(`/dashboards/${id}`, { method: 'DELETE' })

/** Renames a dashboard, and makes it the landing dashboard, clearing any other, or stops it being one. */
export const editDashboard = (id: number, name: string, isLanding: boolean) =>
  request<Dashboard>(`/dashboards/${id}`, json('PATCH', { name, isLanding }))
