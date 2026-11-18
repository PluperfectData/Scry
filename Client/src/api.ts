import { createAuthClient } from '@pluperfect/jwt'
import type { Aggregate, Join, Layouts, TableSort, Widget } from './dashboard'
import type { PresentationSettings } from './presentation'

const baseUrl = import.meta.env.VITE_API_URL

let signedOut: () => void = () => {}

/** Sets what happens when the session ends for good: a refresh was tried and refused. */
export function onSignedOut(listener: () => void) {
  signedOut = listener
}

// Holds no credential: the session is in HttpOnly cookies. It sends the CSRF header and refreshes an expired session once.
const authFetch = createAuthClient({ baseUrl, onSignedOut: () => signedOut() })

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

export interface Source {
  id: number
  name: string
  /** Where the rows come from: an uploaded file, the push API, or Nexus through the push API. */
  kind: 'Upload' | 'Push' | 'Nexus'
  fileName: string | null
  /** The name and prefix of the push API key that writes to a pushed source; null once that key is revoked. */
  pushedBy: string | null
  pushKeyPrefix: string | null
  /** Where a pushed source's rows come from, as its pusher said, such as a Nexus connection's stream. */
  origin: string | null
  columns: Column[]
  rowCount: number
  /** When rows last landed, by upload or by push; null until the first have. */
  syncedAt: string | null
  /** The sign-in of the Nexus connection that fills it; null for every other source. */
  signIn: SourceSignIn | null
}

/** How a Nexus connection's sign-in ends: never on its own, on a clock its provider sets, or without calls that keep it. */
export type SignInKind = 'Lasting' | 'FixedClock' | 'KeptAlive'

/** A Nexus connection's sign-in, as Nexus says. `endsAt` is when a fixed clock ends it; once `ended`, Nexus syncs nothing from it. */
export interface NexusSignIn {
  kind: SignInKind
  signedInAt: string | null
  endsAt: string | null
  endingSoon: boolean
  ended: boolean
  endedAt: string | null
  keptAliveAt: string | null
  accounts: string[]
}

/** A source's Nexus sign-in, with the provider it signs in to, such as Charles Schwab. */
export interface SourceSignIn extends NexusSignIn {
  provider: string
}

/** One setting a Nexus connector asks for. */
export interface SettingField {
  name: string
  label: string
  kind: 'Text' | 'Secret' | 'Number' | 'Boolean' | 'Choice' | 'File'
  required: boolean
  choices: string[] | null
}

/** A connector a source can come from: CSV, which Scry reads itself, or one Nexus reads through. */
export interface Connector {
  id: string
  name: string
  description: string
  fields: SettingField[]
  /** Why it cannot be picked yet, such as a provider the linked Nexus workspace has not set up. */
  notReady?: string | null
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

// Only an answer that says it is JSON is read as JSON: a 202 or a 204 carries no body.
async function readAnswer<T>(response: Response): Promise<T> {
  const json = response.headers.get('content-type')?.includes('json') ? await response.json().catch(() => null) : null
  if (!response.ok) {
    const problem = json as { detail?: string; title?: string } | null
    throw new ApiError(response.status, problem?.detail ?? problem?.title ?? `The request failed (${response.status}).`)
  }
  return (json ?? undefined) as T
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => readAnswer<T>(await authFetch(path, init))

let openWorkspace: number | null = null

/** Sets the workspace that the dashboard, source, key, and Nexus calls below belong to. The workspace's pages set it as they open. */
export function enterWorkspace(id: number) {
  openWorkspace = id
}

function inWorkspace(path: string): string {
  if (openWorkspace === null) throw new Error('No workspace is open.')
  return `/workspaces/${openWorkspace}${path}`
}

/** What a member may do in a workspace. An admin is an editor in every workspace. */
export type WorkspaceRole = 'Editor' | 'Viewer'

/** A workspace, with the signed-in user's role in it. */
export interface Workspace {
  id: number
  name: string
  role: WorkspaceRole
  createdAt: string
}

export interface Member {
  userId: number
  email: string
  role: WorkspaceRole
}

/** A workspace, with its members for an admin, and null for anyone else. */
export interface WorkspaceDetail extends Workspace {
  members: Member[] | null
}

export const listWorkspaces = () => request<Workspace[]>('/workspaces')
export const getWorkspace = (id: number) => request<WorkspaceDetail>(`/workspaces/${id}`)
export const makeWorkspace = (name: string) => request<WorkspaceDetail>('/workspaces', json('POST', { name }))
export const renameWorkspace = (id: number, name: string) => request<WorkspaceDetail>(`/workspaces/${id}`, json('PATCH', { name }))

/** Removes a workspace with everything in it. The API refuses unless `name` is the workspace's name. */
export const removeWorkspace = (id: number, name: string) => request<void>(`/workspaces/${id}`, json('DELETE', { name }))

/** Adds a user to a workspace with a role, or changes their role. */
export const setMember = (id: number, userId: number, role: WorkspaceRole) =>
  request<WorkspaceDetail>(`/workspaces/${id}/members/${userId}`, json('PUT', { role }))
export const removeMember = (id: number, userId: number) =>
  request<WorkspaceDetail>(`/workspaces/${id}/members/${userId}`, { method: 'DELETE' })

/** Who is signed in. */
export interface Me {
  signedIn: boolean
  id: number | null
  email: string | null
  isAdmin: boolean
  hasPassword: boolean
}

export interface User {
  id: number
  email: string
  isAdmin: boolean
  hasPassword: boolean
  createdAt: string
  signedInAt: string | null
  /** The workspaces the user is in, with their role in each. */
  workspaces: { id: number; name: string; role: WorkspaceRole }[]
}

/** An invite link to pass on, given when it was not mailed, with the reason mailing it failed when it was tried. */
export interface InviteLink {
  link: string | null
  mailProblem: string | null
}

export interface Invite extends InviteLink {
  user: User
}

export const getMe = () => request<Me>('/auth/me')
export const signIn = (email: string, password: string, remember: boolean) =>
  request<Me>('/auth/sign-in', json('POST', { email, password, remember }))
export const mailLink = (email: string) => request<void>('/auth/link', json('POST', { email }))
export const redeemLink = (token: string, remember: boolean) => request<Me>('/auth/link/redeem', json('POST', { token, remember }))
export const signOut = () => request<void>('/auth/sign-out', { method: 'POST' })
export const setPassword = (password: string) => request<Me>('/auth/password', json('PUT', { password }))

export const listUsers = () => request<User[]>('/users')
export const inviteUser = (email: string, isAdmin: boolean) => request<Invite>('/users', json('POST', { email, isAdmin }))
export const reinviteUser = (id: number) => request<InviteLink>(`/users/${id}/invite`, { method: 'POST' })
export const editUser = (id: number, isAdmin: boolean) => request<User>(`/users/${id}`, json('PATCH', { isAdmin }))
export const removeUser = (id: number) => request<void>(`/users/${id}`, { method: 'DELETE' })

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export const listSources = () => request<Source[]>(inWorkspace('/sources'))

export const listConnectors = () => request<Connector[]>(inWorkspace('/connectors'))

/** A chart that reads a source, directly or through a join. */
export interface ChartUse {
  dashboardId: number
  dashboardName: string
  chartTitle: string | null
  chartKind: string | null
}

export const listSourceUses = (id: number) => request<ChartUse[]>(inWorkspace(`/sources/${id}/uses`))
export const removeSource = (id: number) => request<void>(inWorkspace(`/sources/${id}`), { method: 'DELETE' })

/** A push API key: the prefix that tells it apart, and the sources it writes. */
export interface IngestKey {
  id: number
  name: string
  prefix: string
  createdAt: string
  sources: string[]
}

export const listKeys = () => request<IngestKey[]>(inWorkspace('/keys'))

/** Makes a key, and answers with the key itself, which Scry shows only this once. */
export const makeKey = (name: string) =>
  request<Omit<IngestKey, 'sources'> & { key: string }>(inWorkspace('/keys'), json('POST', { name }))

/** Revokes a key. The sources it made stay, and no key writes to them. */
export const revokeKey = (id: number) => request<void>(inWorkspace(`/keys/${id}`), { method: 'DELETE' })

/** The workspace's link to Nexus, made by pairing, or `linked: false`. */
export interface NexusLink {
  linked: boolean
  /** The linked Nexus's address, or, unlinked, the one Scry's configuration starts the Link Nexus form with. */
  nexusUrl: string | null
  appName: string | null
  workspaceName: string | null
  /** The push key Scry made for Nexus, which Nexus sends rows with. */
  pushKeyName: string | null
  pushKeyPrefix: string | null
  linkedAt: string | null
}

export const getNexusLink = () => request<NexusLink>(inWorkspace('/nexus'))

/** Opens a pairing at Nexus, and answers the page where its admin approves it. */
export const startNexusPairing = (nexusUrl: string) => request<{ approveUrl: string }>(inWorkspace('/nexus/pairing'), json('POST', { nexusUrl }))

/** Unlinks from Nexus, revoking both keys. The sources Nexus pushed stay. */
export const unlinkNexus = () => request<void>(inWorkspace('/nexus'), { method: 'DELETE' })

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
  connectionId: number
  connectionName: string
  connectorName: string
  /** Its connection's sign-in; null for one that does not sign in. */
  signIn: NexusSignIn | null
  stream: string
  table: string
  mode: 'FullRefresh' | 'Incremental'
  status: 'Ready' | 'Queued' | 'Running' | 'Failed'
  lastRun: { status: 'Running' | 'Succeeded' | 'Failed'; startedAt: string; endedAt: string | null; rows: number; error: string | null } | null
}

export const listNexusConnectors = () => request<NexusConnector[]>(inWorkspace('/nexus/connectors'))

/** Opens Nexus's connect page for a connector, which comes back to the Sources page. */
export const connectThroughNexus = (connector: string) => request<{ url: string }>(inWorkspace('/nexus/connect'), json('POST', { connector }))

export const listNexusSyncs = () => request<NexusSync[]>(inWorkspace('/nexus/syncs'))
export const runNexusSync = (id: number) => request<NexusSync>(inWorkspace(`/nexus/syncs/${id}/run`), { method: 'POST' })

/** Opens Nexus's connect page to sign one of its connections in again, which comes back to the Sources page. */
export const signInAgainThroughNexus = (connectionId: number) =>
  request<{ url: string }>(inWorkspace(`/nexus/connections/${connectionId}/sign-in`), { method: 'POST' })

export function uploadSource(name: string, file: File, delimiter: string): Promise<Source> {
  const form = new FormData()
  form.append('name', name)
  form.append('file', file)
  if (delimiter) form.append('delimiter', delimiter)
  return request<Source>(inWorkspace('/sources'), { method: 'POST', body: form })
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
  return request<T>(inWorkspace(`/sources/${from.sourceId}/${endpoint}${search ? `?${search}` : ''}`))
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

export const listDashboards = () => request<DashboardSummary[]>(inWorkspace('/dashboards'))

export const createDashboard = (name: string) => request<Dashboard>(inWorkspace('/dashboards'), json('POST', { name }))

export const getDashboard = (id: number) => request<Dashboard>(inWorkspace(`/dashboards/${id}`))

export function saveDashboard(dashboard: Pick<Dashboard, 'id' | 'name' | 'layouts' | 'widgets'>): Promise<Dashboard> {
  const { id, name, layouts, widgets } = dashboard
  return request<Dashboard>(inWorkspace(`/dashboards/${id}`), json('PUT', { name, layouts, widgets }))
}

export const deleteDashboard = (id: number) => request<void>(inWorkspace(`/dashboards/${id}`), { method: 'DELETE' })

/**
 * Renames a dashboard, makes it the landing dashboard, clearing any other, or stops it being one, and sets how its
 * data scrolls in full screen.
 */
export const editDashboard = (id: number, name: string, isLanding: boolean, presentation: PresentationSettings) =>
  request<Dashboard>(inWorkspace(`/dashboards/${id}`), json('PATCH', { name, isLanding, presentation }))

export type InstallStage = 'Database' | 'Address' | 'Admin' | 'Done'

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
 * `allowed` says this page may use the installer, and only then are the database and the addresses shown. `mail`
 * says whether Scry can send mail yet.
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
  mail: boolean
  /** How the instance sends mail, given when this page may use the installer. */
  mailSettings: MailSettings | null
}

export type MailTransport = 'None' | 'Postmark' | 'Files'

/** How the instance sends mail. A field set by Scry's configuration cannot be changed here. */
export interface MailSettings {
  transport: MailTransport
  tokenSet: boolean
  tokenConfigured: boolean
  from: string | null
  fromConfigured: boolean
  fromName: string
  fromNameConfigured: boolean
  /** The folder mail is written to instead of sent, when configuration names one. */
  folder: string | null
}

/** The instance's addresses, mail, and database. A value set by Scry's configuration cannot be changed here. */
export interface InstanceSettings {
  clientOrigin: string | null
  clientOriginConfigured: boolean
  apiOrigin: string | null
  apiOriginConfigured: boolean
  mail: MailSettings
  database: DatabasePlace | null
  databaseConfigured: boolean
  /** How many days the Log page keeps an entry. */
  logDays: number
  logDaysConfigured: boolean
}

export interface TestMail {
  sentTo: string
  transport: MailTransport
  folder: string | null
}

// The installer checks who calls it itself, so it goes around the session's client: a refused code is not a signed-out
// session. It sends cookies, since its admin stage signs the admin in. A page on another machine sends the install code.
const install = async <T>(code: string | null, path: string, method = 'GET', body?: unknown): Promise<T> =>
  readAnswer<T>(
    await fetch(`${baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(code ? { Authorization: `Bearer scryi_${code}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )

export const getInstall = (code: string | null = null) => install<InstallView>(code, '/install')
export const installDatabase = (code: string | null, database: DatabaseForm) =>
  install<InstallView>(code, '/install/database', 'POST', database)
export const installAddresses = (code: string | null, addresses: Addresses) =>
  install<InstallView>(code, '/install/addresses', 'POST', addresses)
/** The first admin; the password may be blank once mail works, to sign in by mailed links. */
export const installAdmin = (code: string | null, email: string, password: string) =>
  install<Me>(code, '/install/admin', 'POST', { email, password })
export const installMail = (code: string | null, serverToken: string, from: string, fromName: string) =>
  install<InstallView>(code, '/install/mail', 'PUT', { serverToken, from, fromName })
export const installMailOff = (code: string | null) => install<InstallView>(code, '/install/mail', 'DELETE')
export const installTestMail = (code: string | null, to: string) => install<TestMail>(code, '/install/mail/test', 'POST', { to })
export const askForInstallCode = () => install<void>(null, '/install/code', 'POST')

export const getInstanceSettings = () => request<InstanceSettings>('/settings')
export const saveAddresses = (addresses: Addresses) => request<InstanceSettings>('/settings/addresses', json('PUT', addresses))
export const saveDatabase = (database: DatabaseForm) => request<InstanceSettings>('/settings/database', json('PUT', database))
export const saveMail = (serverToken: string, from: string, fromName: string) =>
  request<InstanceSettings>('/settings/mail', json('PUT', { serverToken, from, fromName }))
export const turnOffMail = () => request<InstanceSettings>('/settings/mail', { method: 'DELETE' })
export const testMail = () => request<TestMail>('/settings/mail/test', { method: 'POST' })

/** What the mail form does with what it is given: the Settings page's calls, or the installer's. */
export interface MailActions {
  save: (serverToken: string, from: string, fromName: string) => Promise<void>
  off: () => Promise<void>
  /** The installer asks where a test mail goes, since no admin exists yet to mail. */
  test: (to: string) => Promise<TestMail>
  asksForRecipient: boolean
}

export const saveLogDays = (days: number) => request<InstanceSettings>('/settings/log', json('PUT', { days }))

export type EntryLevel = 'Information' | 'Warning' | 'Error'

/** Something that happened, in a sentence. `workspaceId` is null for an entry about the whole instance. */
export interface LogEntry {
  id: number
  at: string
  level: EntryLevel
  text: string
  actor: string | null
  workspaceId: number | null
  workspaceName: string | null
  sourceId: number | null
}

/** A page of entries, newest first. `next` reads the older ones; `subject` names the source filtered by. */
export interface LogEntries {
  entries: LogEntry[]
  next: number | null
  subject: string | null
}

/** `instance` picks the entries about the whole instance; `level: 'Warning'` keeps warnings and errors. */
export interface LogFilter {
  workspace?: number
  instance?: boolean
  source?: number
  level?: 'Warning'
  before?: number
}

export function getLog(filter: LogFilter) {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(filter)) {
    if (value !== undefined && value !== false) query.set(name, String(value))
  }
  const text = query.toString()
  return request<LogEntries>(text ? `/log?${text}` : '/log')
}
