import { isBefore, parseISO, startOfDay } from 'date-fns'
import type { Project, Task } from '../types'

export const isOverdue = (task: Task, now = new Date()) => !task.completed && task.status !== 'cancelled' && Boolean(task.due_date && isBefore(parseISO(task.due_date), startOfDay(now)))
export const completionRate = (tasks: Task[]) => tasks.length ? Math.min(100, Math.round(tasks.filter(t => t.completed).length / tasks.length * 100)) : 0
export const projectProgress = (project: Project, tasks: Task[]) => {
  const linked = tasks.filter(t => t.project_id === project.id && t.status !== 'cancelled')
  return linked.length ? Math.min(100, Math.round(linked.filter(t => t.completed).length / linked.length * 100)) : 0
}
export function validateEvent(start: string, end: string) {
  const a = Date.parse(start), b = Date.parse(end)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) throw new Error('Event end must be after its start.')
}
export const searchWorkspace = <T extends { id: string }>(groups: Record<string, T[]>, query: string, text: (item: T) => string) => {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return {}
  return Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, items.filter(item => text(item).toLocaleLowerCase().includes(q))]).filter(([, items]) => (items as T[]).length))
}
