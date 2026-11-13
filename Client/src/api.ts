import type { Aggregate, Layouts, Widget } from './dashboard'

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

export interface Source {
  id: number
  name: string
  fileName: string
  columns: Column[]
  rowCount: number
  syncedAt: string
}

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
export interface Rows {
  columns: Column[]
  values: (string | null)[][]
  truncated: boolean
}

export interface DashboardSummary {
  id: number
  name: string
  updatedAt: string
}

export interface Dashboard {
  id: number
  name: string
  layouts: Layouts
  widgets: Widget[]
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

export function uploadSource(name: string, file: File, delimiter: string): Promise<Source> {
  const form = new FormData()
  form.append('name', name)
  form.append('file', file)
  if (delimiter) form.append('delimiter', delimiter)
  return request<Source>('/sources', { method: 'POST', body: form })
}

export function getSeries(sourceId: number, x: string, y: string | null, aggregate: Aggregate): Promise<Series> {
  const query = new URLSearchParams({ x, aggregate })
  if (y) query.set('y', y)
  return request<Series>(`/sources/${sourceId}/series?${query}`)
}

export function getPoints(sourceId: number, x: string, y: string): Promise<Series> {
  return request<Series>(`/sources/${sourceId}/points?${new URLSearchParams({ x, y })}`)
}

export function getCandles(
  sourceId: number,
  prices: { x: string; open: string; high: string; low: string; close: string },
): Promise<Series> {
  return request<Series>(`/sources/${sourceId}/candles?${new URLSearchParams(prices)}`)
}

export function getGroups(
  sourceId: number,
  settings: { x: string; group: string; y: string | null; aggregate: Aggregate },
): Promise<Series> {
  const query = new URLSearchParams({ x: settings.x, group: settings.group, aggregate: settings.aggregate })
  if (settings.y) query.set('y', settings.y)
  return request<Series>(`/sources/${sourceId}/groups?${query}`)
}

export function getHistogram(sourceId: number, column: string, bins: number): Promise<Series> {
  return request<Series>(`/sources/${sourceId}/histogram?${new URLSearchParams({ column, bins: String(bins) })}`)
}

export function getBoxes(sourceId: number, value: string, group: string | null): Promise<Series> {
  const query = new URLSearchParams({ value })
  if (group) query.set('group', group)
  return request<Series>(`/sources/${sourceId}/boxes?${query}`)
}

export function getRows(sourceId: number, columns: string[]): Promise<Rows> {
  const query = new URLSearchParams()
  for (const column of columns) query.append('columns', column)
  const search = query.toString()
  return request<Rows>(`/sources/${sourceId}/rows${search ? `?${search}` : ''}`)
}

export const listDashboards = () => request<DashboardSummary[]>('/dashboards')

export const createDashboard = (name: string) => request<Dashboard>('/dashboards', json('POST', { name }))

export const getDashboard = (id: number) => request<Dashboard>(`/dashboards/${id}`)

export function saveDashboard(dashboard: Pick<Dashboard, 'id' | 'name' | 'layouts' | 'widgets'>): Promise<Dashboard> {
  const { id, name, layouts, widgets } = dashboard
  return request<Dashboard>(`/dashboards/${id}`, json('PUT', { name, layouts, widgets }))
}

export const deleteDashboard = (id: number) => request<void>(`/dashboards/${id}`, { method: 'DELETE' })
