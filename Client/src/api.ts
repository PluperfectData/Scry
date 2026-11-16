import type { Aggregate, Join, Layouts, TableSort, Widget } from './dashboard'
import type { PresentationSettings } from './presentation'

const baseUrl = import.meta.env.VITE_API_URL

/** The API's address, for pages that show it, such as the push API reference. */
export const apiUrl: string = baseUrl

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

/** How a source's last sync went. `SignInNeeded` means the service ended the sign-in it syncs with. */
export type SourceStatus = 'Ready' | 'Syncing' | 'Failed' | 'SignInNeeded'

export interface Source {
  id: number
  name: string
  /** Where the rows come from: an uploaded file, a connection's stream, the push API, or Nexus through the push API. */
  kind: 'Upload' | 'Connection' | 'Push' | 'Nexus'
  fileName: string | null
  connector: string | null
  stream: string | null
  /** The name and prefix of the push API key that writes to a pushed source; null once that key is revoked. */
  pushedBy: string | null
  pushKeyPrefix: string | null
  /** Where a pushed source's rows come from, as its pusher said, such as a Nexus connection's stream. */
  origin: string | null
  columns: Column[]
  rowCount: number
  /** When the last sync finished; null until the first one has. */
  syncedAt: string | null
  status: SourceStatus
  /** Why the last sync failed, when it did. */
  error: string | null
}

/** One setting a Nexus connector asks for. */
export interface SettingField {
  name: string
  label: string
  kind: 'Text' | 'Secret' | 'Number' | 'Boolean' | 'Choice' | 'File'
  required: boolean
  choices: string[] | null
}

/** A connector Scry reads a source through itself: CSV, or Schwab. */
export interface Connector {
  id: string
  name: string
  description: string
  fields: SettingField[]
  /** The settings this connector requires that Scry lacks, by their configuration names. */
  needs: string[]
  /** Why it cannot be picked yet, such as a sign-in app the linked Nexus workspace has not set. */
  notReady?: string | null
}

/** A stream Schwab offers, by name, with its number of columns. */
export interface StreamSummary {
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
  /** How its data scrolls in full screen; null for the defaults. */
  presentation: PresentationSettings | null
  updatedAt: string
}

export interface Dashboard {
  id: number
  name: string
  layouts: Layouts
  widgets: Widget[]
  isLanding: boolean
  presentation: PresentationSettings | null
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

/** Copies a connection's stream into its source again. */
export const syncSource = (id: number) => request<Source>(`/sources/${id}/sync`, { method: 'POST' })

/** A chart that reads a source, directly or through a join. */
export interface ChartUse {
  dashboardId: number
  dashboardName: string
  chartTitle: string | null
  chartKind: string | null
}

export const listSourceUses = (id: number) => request<ChartUse[]>(`/sources/${id}/uses`)
export const removeSource = (id: number) => request<void>(`/sources/${id}`, { method: 'DELETE' })

/** The streams a Schwab connection offers, by name; listing them needs no sign-in. */
export const listSchwabStreams = () => request<StreamSummary[]>('/schwab/streams')

/** Starts a Schwab sign-in for a new connection, and returns Schwab's sign-in page for the browser to go to. */
export const startSchwabSignIn = (settings: Settings, streams: { table: string; name: string }[]) =>
  request<{ url: string }>('/schwab/sign-in', json('POST', { settings, streams }))

/** A push API key: the prefix that tells it apart, and the sources it writes. */
export interface IngestKey {
  id: number
  name: string
  prefix: string
  createdAt: string
  sources: string[]
}

export const listKeys = () => request<IngestKey[]>('/keys')

/** Makes a key, and answers with the key itself, which Scry shows only this once. */
export const makeKey = (name: string) =>
  request<Omit<IngestKey, 'sources'> & { key: string }>('/keys', json('POST', { name }))

/** Revokes a key. The sources it made stay, and no key writes to them. */
export const revokeKey = (id: number) => request<void>(`/keys/${id}`, { method: 'DELETE' })

/** Scry's link to Nexus, made by pairing, or `linked: false`. */
export interface NexusLink {
  linked: boolean
  nexusUrl: string | null
  appName: string | null
  workspaceName: string | null
  /** The push key Scry made for Nexus, which Nexus sends rows with. */
  pushKeyName: string | null
  pushKeyPrefix: string | null
  linkedAt: string | null
}

export const getNexusLink = () => request<NexusLink>('/nexus')

/** Opens a pairing at Nexus, and answers the page where its admin approves it. */
export const startNexusPairing = (nexusUrl: string) => request<{ approveUrl: string }>('/nexus/pairing', json('POST', { nexusUrl }))

/** Unlinks from Nexus, revoking both keys. The sources Nexus pushed stay. */
export const unlinkNexus = () => request<void>('/nexus', { method: 'DELETE' })

/** A connector Nexus reads through, such as MySQL, with why the link's workspace cannot connect it yet. */
export interface NexusConnector {
  id: string
  name: string
  description: string
  notReady: string | null
}

/** A sync at Nexus into the link's destination: what it reads, the table it fills, and how its last run went. */
export interface NexusSync {
  id: number
  connectionName: string
  connectorName: string
  needsSignIn: boolean
  stream: string
  table: string
  mode: 'FullRefresh' | 'Incremental'
  status: 'Ready' | 'Queued' | 'Running' | 'Failed'
  lastRun: { status: 'Running' | 'Succeeded' | 'Failed'; startedAt: string; endedAt: string | null; rows: number; error: string | null } | null
}

export const listNexusConnectors = () => request<NexusConnector[]>('/nexus/connectors')

/** Opens Nexus's connect page for a connector, which comes back to the Sources page. */
export const connectThroughNexus = (connector: string) => request<{ url: string }>('/nexus/connect', json('POST', { connector }))

export const listNexusSyncs = () => request<NexusSync[]>('/nexus/syncs')
export const runNexusSync = (id: number) => request<NexusSync>(`/nexus/syncs/${id}/run`, { method: 'POST' })

/** Starts a sign-in that renews the one a Schwab source's connection holds. */
export const signInAgain = (id: number) => request<{ url: string }>(`/sources/${id}/sign-in`, { method: 'POST' })

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

/**
 * Renames a dashboard, makes it the landing dashboard, clearing any other, or stops it being one, and sets how its
 * data scrolls in full screen.
 */
export const editDashboard = (id: number, name: string, isLanding: boolean, presentation: PresentationSettings) =>
  request<Dashboard>(`/dashboards/${id}`, json('PATCH', { name, isLanding, presentation }))

export type InstallStage = 'Database' | 'Address' | 'Done'

/** A MySQL database's place, without its password. */
export interface DatabasePlace {
  host: string
  port: number
  name: string
  user: string
}

export interface DatabaseForm extends DatabasePlace {
  password: string
}

export interface Addresses {
  clientOrigin: string
  apiOrigin: string
}

/**
 * Where the instance stands. `local` says this page is on the machine Scry runs on, which needs no install code;
 * `allowed` says this page may use the installer, and only then are the database and the addresses shown.
 */
export interface InstallView {
  installed: boolean
  stage: InstallStage
  local: boolean
  allowed: boolean
  databaseConfigured: boolean
  database: DatabasePlace | null
  databaseProblem: string | null
  clientOrigin: string | null
  clientOriginConfigured: boolean
  apiOrigin: string | null
  apiOriginConfigured: boolean
}

/** The instance's addresses and database. A value set by Scry's configuration cannot be changed here. */
export interface InstanceSettings {
  clientOrigin: string | null
  clientOriginConfigured: boolean
  apiOrigin: string | null
  apiOriginConfigured: boolean
  database: DatabasePlace | null
  databaseConfigured: boolean
}

// A page on another machine than Scry's sends the install code from Scry's log.
const install = <T>(code: string | null, path: string, method = 'GET', body?: unknown) =>
  request<T>(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(code ? { Authorization: `Bearer scryi_${code}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

export const getInstall = (code: string | null = null) => install<InstallView>(code, '/install')
export const installDatabase = (code: string | null, database: DatabaseForm) =>
  install<InstallView>(code, '/install/database', 'POST', database)
export const installAddresses = (code: string | null, addresses: Addresses) =>
  install<InstallView>(code, '/install/addresses', 'POST', addresses)
export const askForInstallCode = () => install<void>(null, '/install/code', 'POST')

export const getInstanceSettings = () => request<InstanceSettings>('/settings')
export const saveAddresses = (addresses: Addresses) => request<InstanceSettings>('/settings/addresses', json('PUT', addresses))
export const saveDatabase = (database: DatabaseForm) => request<InstanceSettings>('/settings/database', json('PUT', database))
