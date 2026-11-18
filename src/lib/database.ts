import Dexie, { type Table } from 'dexie'
import type { AttendanceRecord, Bookmark, CalendarEvent, DailyPlan, FocusSession, KnowledgeArticle, LocalFile, Milestone, Note, Preferences, Project, Subtask, Tag, Task, TimeEntry } from '../types'
import { getWorkspaceDatabaseName, getWorkspaceStorageScope, setWorkspaceStorageScope } from './workspaces'

export class WorkspaceDatabase extends Dexie {
  tasks!: Table<Task, 'id'>; projects!: Table<Project, 'id'>; subtasks!: Table<Subtask, 'id'>
  milestones!: Table<Milestone, 'id'>; calendarEvents!: Table<CalendarEvent, 'id'>; notes!: Table<Note, 'id'>
  knowledgeArticles!: Table<KnowledgeArticle, 'id'>; bookmarks!: Table<Bookmark, 'id'>; files!: Table<LocalFile, 'id'>
  timeEntries!: Table<TimeEntry, 'id'>; focusSessions!: Table<FocusSession, 'id'>; dailyPlans!: Table<DailyPlan, 'id'>
  tags!: Table<Tag, 'id'>; preferences!: Table<Preferences, 'id'>
  attendance!: Table<AttendanceRecord, 'id'>
  syncQueue!: Table<{ id: string; workspace_id: string; collection: string; record_id: string; operation: 'delete'; created_at: string }, string>
  constructor() {
    super(getWorkspaceDatabaseName())
    this.version(1).stores({ tasks:'id, created_at, updated_at, due_date, status, priority, project_id', projects:'id, created_at, updated_at, status', subtasks:'id, task_id, created_at', milestones:'id, project_id, due_date', calendarEvents:'id, starts_at, ends_at', notes:'id, created_at, updated_at, pinned, archived', knowledgeArticles:'id, category, updated_at, favorite', bookmarks:'id, url, category, favorite', files:'id, name, category, created_at', timeEntries:'id, started_at, ended_at, project_id, task_id', focusSessions:'id, started_at, ended_at', dailyPlans:'id, date', tags:'id, name', preferences:'id' })
    this.version(2).stores({ tasks:'id, created_at, updated_at, due_date, status, priority, project_id, deleted_at', projects:'id, created_at, updated_at, status, deleted_at', subtasks:'id, task_id, created_at, deleted_at', milestones:'id, project_id, due_date, deleted_at', calendarEvents:'id, starts_at, ends_at, deleted_at', notes:'id, created_at, updated_at, pinned, archived, deleted_at', knowledgeArticles:'id, category, updated_at, favorite, deleted_at', bookmarks:'id, url, category, favorite, deleted_at', files:'id, name, category, created_at, deleted_at', timeEntries:'id, started_at, ended_at, project_id, task_id, deleted_at', focusSessions:'id, started_at, ended_at, deleted_at', dailyPlans:'id, date, deleted_at', tags:'id, name, deleted_at', preferences:'id' })
    this.version(3).stores({ tasks:'id, created_at, updated_at, due_date, status, priority, project_id, deleted_at', projects:'id, created_at, updated_at, status, deleted_at', subtasks:'id, task_id, created_at, deleted_at', milestones:'id, project_id, due_date, deleted_at', calendarEvents:'id, starts_at, ends_at, deleted_at', notes:'id, created_at, updated_at, pinned, archived, deleted_at', knowledgeArticles:'id, category, updated_at, favorite, deleted_at', bookmarks:'id, url, category, favorite, deleted_at', files:'id, name, category, created_at, deleted_at', timeEntries:'id, started_at, ended_at, project_id, task_id, deleted_at', focusSessions:'id, started_at, ended_at, deleted_at', dailyPlans:'id, date, deleted_at', tags:'id, name, deleted_at', preferences:'id', attendance:'id, clock_in_at, clock_out_at, work_date, created_at' })
    this.version(4).stores({ tasks:'id, created_at, updated_at, due_date, status, priority, project_id, deleted_at', projects:'id, created_at, updated_at, status, deleted_at', subtasks:'id, task_id, created_at, deleted_at', milestones:'id, project_id, due_date, deleted_at', calendarEvents:'id, starts_at, ends_at, deleted_at', notes:'id, created_at, updated_at, pinned, archived, deleted_at', knowledgeArticles:'id, category, updated_at, favorite, deleted_at', bookmarks:'id, url, category, favorite, deleted_at', files:'id, name, category, created_at, deleted_at', timeEntries:'id, started_at, ended_at, project_id, task_id, deleted_at', focusSessions:'id, started_at, ended_at, deleted_at', dailyPlans:'id, date, deleted_at', tags:'id, name, deleted_at', preferences:'id', attendance:'id, clock_in_at, clock_out_at, work_date, created_at', syncQueue:'id, workspace_id, collection, record_id, operation, created_at' })
  }
}
export let db = new WorkspaceDatabase()
export const newId = () => crypto.randomUUID()
export const stamp = () => new Date().toISOString()

export interface Repository<T extends { id: string }> {
  all(): Promise<T[]>; get(id: string): Promise<T | undefined>; save(value: T): Promise<void>; remove(id: string): Promise<void>
}
export class DexieRepository<T extends { id: string }> implements Repository<T> {
  constructor(private table: Table<T>) {}
  all() { return this.table.toArray() }
  get(id: string) { return this.table.get(id) }
  async save(value: T) { await this.table.put(value) }
  async remove(id: string) { await this.table.delete(id) }
}
function makeRepositories(database: WorkspaceDatabase) {
  return {
    tasks: new DexieRepository<Task>(database.tasks), projects: new DexieRepository<Project>(database.projects), notes: new DexieRepository<Note>(database.notes),
    calendar: new DexieRepository<CalendarEvent>(database.calendarEvents), bookmarks: new DexieRepository<Bookmark>(database.bookmarks), files: new DexieRepository<LocalFile>(database.files), timeEntries: new DexieRepository<TimeEntry>(database.timeEntries),
    knowledge: new DexieRepository<KnowledgeArticle>(database.knowledgeArticles), settings: new DexieRepository<Preferences>(database.preferences),
    attendance: new DexieRepository<AttendanceRecord>(database.attendance),
  }
}
export let repositories = makeRepositories(db)
let databaseReady: Promise<void> | null = null
let accountScopeChange: Promise<void> = Promise.resolve()

export function setDatabaseAccountScope(userId: string | null): Promise<void> {
  const nextScope = userId ? `user:${userId}` : 'offline'
  const change = async () => {
    if (getWorkspaceStorageScope() === nextScope) {
      if (databaseReady) await databaseReady
      else databaseReady = db.open().then(() => undefined)
      return
    }
    db.close()
    setWorkspaceStorageScope(userId)
    db = new WorkspaceDatabase()
    repositories = makeRepositories(db)
    databaseReady = db.open().then(() => undefined)
    await databaseReady
  }
  const result = accountScopeChange.then(change)
  accountScopeChange = result.then(() => undefined, () => undefined)
  return result
}

export async function startTimeEntry(input: { project_id?: string | null; task_id?: string | null; description: string }) {
  const now=stamp()
  return db.transaction('rw',db.timeEntries,db.tasks,async()=>{
    if(await db.timeEntries.filter(entry=>entry.ended_at===null).count()) throw new Error('A timer is already running. Stop it before starting another.')
    const entry={id:newId(),created_at:now,updated_at:now,started_at:now,ended_at:null,...input}
    await db.timeEntries.add(entry);return entry
  })
}
export async function stopTimeEntry(id: string) {
  const now=stamp()
  return db.transaction('rw',db.timeEntries,db.tasks,async()=>{
    const entry=await db.timeEntries.where('id').equals(id).first()
    if(!entry||entry.ended_at)throw new Error('The active timer could not be found.')
    const updated={...entry,ended_at:now,updated_at:now}
    await db.timeEntries.put(updated)
    if(entry.task_id){
      const task=await db.tasks.where('id').equals(entry.task_id).first()
      if(task)await db.tasks.put({...task,actual_minutes:(task.actual_minutes??0)+Math.max(0,Date.parse(now)-Date.parse(entry.started_at))/60000,updated_at:now})
    }
    return updated
  })
}
export const getActiveTimeEntry = async () => (await db.timeEntries.filter(entry=>entry.ended_at===null).first())
export const getTimeEntries = async () => db.timeEntries.toArray()
export const getAttendanceRecords = async () => db.attendance.toArray()
export async function clockIn(timezone='Asia/Kolkata',note = '') {
  const now=stamp(),work_date=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))
  return db.transaction('rw',db.attendance,async()=>{
    if(await db.attendance.filter(record=>record.clock_out_at===null).count())throw new Error('You are already clocked in or on a break.')
    if(await db.attendance.where('work_date').equals(work_date).count())throw new Error('Attendance is already recorded for today.')
    const record={id:newId(),clock_in_at:now,clock_out_at:null,work_date,note,status:'present' as const,breaks:[],created_at:now,updated_at:now};await db.attendance.add(record);return record
  })
}
export async function clockOut(id:string) {
  const now=stamp()
  return db.transaction('rw',db.attendance,async()=>{
    const record=await db.attendance.where('id').equals(id).first()
    if(!record||record.clock_out_at||record.breaks?.some(item=>!item.in_at&&!item.skipped))throw new Error('End any active break before clocking out.')
    const updated={...record,clock_out_at:now,updated_at:now};await db.attendance.put(updated);return updated
  })
}
export async function startAttendanceBreak(id:string,kind:'morning_tea'|'lunch'|'afternoon_tea') {
  const now=stamp()
  return db.transaction('rw',db.attendance,async()=>{
    const record=await db.attendance.where('id').equals(id).first()
    if(!record||record.clock_out_at||record.status==='absent')throw new Error('Clock in before starting a break.')
    const breaks=record.breaks??[]
    if(breaks.some(item=>!item.in_at&&!item.skipped))throw new Error('End the active break first.')
    if(breaks.some(item=>item.kind===kind))throw new Error('This break has already been recorded today.')
    const order=['morning_tea','lunch','afternoon_tea'] as const
    if(order.slice(0,order.indexOf(kind)).some(required=>!breaks.some(item=>item.kind===required)))throw new Error('Record or skip the earlier break first.')
    const next={...record,breaks:[...breaks,{kind,out_at:now,in_at:null}],updated_at:now};await db.attendance.put(next);return next
  })
}
export async function skipAttendanceBreak(id:string,kind:'morning_tea'|'lunch'|'afternoon_tea') {
  const now=stamp()
  return db.transaction('rw',db.attendance,async()=>{
    const record=await db.attendance.where('id').equals(id).first()
    if(!record||record.clock_out_at||record.status==='absent')throw new Error('Clock in before changing breaks.')
    const breaks=record.breaks??[],order=['morning_tea','lunch','afternoon_tea'] as const
    if(breaks.some(item=>!item.in_at&&!item.skipped))throw new Error('End the active break first.')
    if(breaks.some(item=>item.kind===kind))throw new Error('This break has already been recorded.')
    if(order.slice(0,order.indexOf(kind)).some(required=>!breaks.some(item=>item.kind===required)))throw new Error('Record or skip the earlier break first.')
    const next={...record,breaks:[...breaks,{kind,out_at:null,in_at:null,skipped:true}],updated_at:now};await db.attendance.put(next);return next
  })
}
export async function endAttendanceBreak(id:string) {
  const now=stamp()
  return db.transaction('rw',db.attendance,async()=>{
    const record=await db.attendance.where('id').equals(id).first(),breaks=record?.breaks??[],activeIndex=breaks.findIndex(item=>!item.in_at&&!item.skipped),active=breaks[activeIndex]
    if(!record||record.clock_out_at||!active)throw new Error('There is no active break to end.')
    const next={...record,breaks:breaks.map((item,index)=>index===activeIndex?{...item,in_at:now}:item),updated_at:now};await db.attendance.put(next);return next
  })
}
export async function markAttendanceAbsent(timezone:string, date:Date, status:'absent'|'leave'|'holiday'='absent', reason?:string) {
  const work_date=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)
  const now=stamp(),record={id:newId(),clock_in_at:now,clock_out_at:now,work_date,note:reason?.trim()||({absent:'Marked absent',leave:'Took leave',holiday:'Company declared holiday'}[status]),status,breaks:[],created_at:now,updated_at:now}
  return db.transaction('rw',db.attendance,async()=>{
    if(await db.attendance.where('work_date').equals(work_date).count())throw new Error('Attendance is already recorded for this date.')
    await db.attendance.add(record);return record
  })
}
