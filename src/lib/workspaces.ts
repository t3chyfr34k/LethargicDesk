export interface EmploymentRole {
  id: string
  title: string
  start_date: string
  end_date: string | null
}

export interface Workspace {
  id: string
  type: 'personal' | 'company'
  name: string
  roles: EmploymentRole[]
  created_at: string
  updated_at?: string
}

const workspaceKey = 'lethargic-desk:workspaces:v1'
const activeKey = 'lethargic-desk:active-workspace:v1'
let accountScope = 'offline'
const personalWorkspace: Workspace = { id: 'personal', type: 'personal', name: 'Personal', roles: [], created_at: '2026-01-01T00:00:00.000Z' }
const validDate = (value: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value }

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}

function scopedKey(key: string): string {
  return accountScope === 'offline' ? key : `${key}:${accountScope}`
}

export function setWorkspaceStorageScope(userId: string | null): void {
  accountScope = userId ? `user:${userId}` : 'offline'
}

export function getWorkspaceStorageScope(): string {
  return accountScope
}

export function getWorkspaces(): Workspace[] {
  const store = storage()
  if (!store) return [personalWorkspace]
  try {
    const parsed = JSON.parse(store.getItem(scopedKey(workspaceKey)) ?? 'null') as Workspace[] | null
    const list = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && (item.type === 'personal' || item.type === 'company')) : []
    if (!list.some((item) => item.id === 'personal')) list.unshift(personalWorkspace)
    store.setItem(scopedKey(workspaceKey), JSON.stringify(list))
    return list
  } catch {
    store.setItem(scopedKey(workspaceKey), JSON.stringify([personalWorkspace]))
    return [personalWorkspace]
  }
}

export function replaceWorkspaces(workspaces: Workspace[]): void {
  const store=storage()
  if(!store)return
  const safe=workspaces.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&(item.type==='personal'||item.type==='company'))
  if(!safe.some(item=>item.id==='personal'))safe.unshift(personalWorkspace)
  store.setItem(scopedKey(workspaceKey),JSON.stringify(safe))
}

export function getActiveWorkspaceId(): string {
  const list = getWorkspaces()
  const stored = storage()?.getItem(scopedKey(activeKey))
  return stored && list.some((item) => item.id === stored) ? stored : 'personal'
}

export function getActiveWorkspace(): Workspace {
  const id = getActiveWorkspaceId()
  return getWorkspaces().find((item) => item.id === id) ?? personalWorkspace
}

export function getWorkspaceDatabaseName(workspaceId = getActiveWorkspaceId()): string {
  const account = accountScope === 'offline' ? '' : `-account-${accountScope.slice('user:'.length)}`
  return workspaceId === 'personal' ? `lethargic-desk${account}` : `lethargic-desk${account}-workspace-${workspaceId}`
}

export function selectWorkspace(id: string): void {
  if (!getWorkspaces().some((item) => item.id === id)) throw new Error('Workspace not found.')
  storage()?.setItem(scopedKey(activeKey), id)
}

export function createCompanyWorkspace(name: string, roleTitle: string, startDate: string, workspaceId: string = crypto.randomUUID()): Workspace {
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Enter a company name.')
  if (roleTitle.trim() && !validDate(startDate)) throw new Error('Choose a valid role start date.')
  const now = new Date().toISOString()
  const workspace: Workspace = {
    id: workspaceId, type: 'company', name: cleanName, roles: roleTitle.trim() ? [{ id: crypto.randomUUID(), title: roleTitle.trim(), start_date: startDate, end_date: null }] : [], created_at: now, updated_at: now,
  }
  const store = storage()
  if (!store) throw new Error('Workspace storage is unavailable.')
  store.setItem(scopedKey(workspaceKey), JSON.stringify([...getWorkspaces(), workspace]))
  return workspace
}

export function saveWorkspace(workspace: Workspace): void {
  if (workspace.type === 'personal') throw new Error('The Personal workspace cannot be edited here.')
  if (workspace.roles.some((role) => !role.title.trim() || !validDate(role.start_date) || (role.end_date !== null && (!validDate(role.end_date) || role.end_date < role.start_date)))) throw new Error('Each role needs a valid title and date range.')
  const store = storage()
  if (!store) throw new Error('Workspace storage is unavailable.')
  const list = getWorkspaces()
  if (!list.some((item) => item.id === workspace.id)) throw new Error('Workspace not found.')
  store.setItem(scopedKey(workspaceKey), JSON.stringify(list.map((item) => item.id === workspace.id ? {...workspace,updated_at:new Date().toISOString()} : item)))
}

export function getEmploymentTenure(startDate: string, endDate: string | null, todayDate = new Date().toISOString().slice(0, 10)) {
  const [year, month, day] = startDate.split('-').map(Number)
  if (!validDate(startDate) || (endDate !== null && !validDate(endDate)) || !validDate(todayDate)) return null
  const start = new Date(Date.UTC(year, month - 1, day))
  const effectiveEnd = endDate ?? todayDate
  const end = new Date(`${effectiveEnd}T00:00:00.000Z`)
  if (!Number.isFinite(start.getTime()) || end < start) return null
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  let years = end.getUTCFullYear() - start.getUTCFullYear()
  let anchor = new Date(Date.UTC(start.getUTCFullYear() + years, start.getUTCMonth(), start.getUTCDate()))
  if (anchor > end) { years--; anchor = new Date(Date.UTC(start.getUTCFullYear() + years, start.getUTCMonth(), start.getUTCDate())) }
  let months = (end.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + end.getUTCMonth() - anchor.getUTCMonth()
  let monthAnchor = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, start.getUTCDate()))
  if (monthAnchor > end) { months--; monthAnchor = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, start.getUTCDate())) }
  const days = Math.floor((end.getTime() - monthAnchor.getTime()) / 86_400_000)
  return { years, months, days: totalDays === 1 ? 1 : days, totalDays }
}
