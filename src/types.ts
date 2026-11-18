export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'inbox' | 'todo' | 'in_progress' | 'done' | 'cancelled'
export interface Entity { id: string; created_at: string; updated_at: string; deleted_at?: string | null }
export interface Task extends Entity { user_id: 'local'; title: string; description: string | null; due_date: string | null; priority: Priority; completed: boolean; status: TaskStatus; project_id?: string | null; tags?: string[]; estimated_minutes?: number | null; actual_minutes?: number; completed_at?: string | null; start_date?: string | null }
export interface Project extends Entity { user_id: 'local'; name: string; description: string | null; status: 'active' | 'on_hold' | 'completed'; priority?: Priority; start_date?: string | null; target_date?: string | null; color?: string; features?: string[]; pages?: string[]; completed_items?: string[]; todo_items?: string[] }
export interface Note extends Entity { user_id: 'local'; title: string; body: string; tags?: string[]; pinned?: boolean; archived?: boolean }
export interface Bookmark extends Entity { user_id: 'local'; title: string; url: string; description?: string; category?: string; tags?: string[]; favorite?: boolean }
export interface Subtask extends Entity { task_id: string; title: string; completed: boolean }
export interface Milestone extends Entity { project_id: string; title: string; due_date?: string | null; completed: boolean }
export interface CalendarEvent extends Entity { title: string; description?: string; starts_at: string; ends_at: string; all_day: boolean; task_id?: string | null; recurrence?: string | null }
export interface KnowledgeArticle extends Entity { title: string; content: string; category: string; tags: string[]; favorite: boolean }
export interface LocalFile extends Entity { name: string; mime_type: string; size: number; category: string; blob: Blob }
export interface TimeEntry extends Entity { started_at: string; ended_at: string | null; project_id?: string | null; task_id?: string | null; description: string }
export interface FocusSession extends Entity { started_at: string; ended_at: string; duration_seconds: number; mode: string }
export interface DailyPlan extends Entity { date: string; task_ids: string[]; priorities: string[] }
export interface Tag extends Entity { name: string; color: string }
export interface Preferences extends Entity { id: 'preferences'; theme: 'light'|'dark'|'system'; timezone: string; week_starts_on: number; date_format: string; time_format: '12h'|'24h'; default_priority: Priority; focus_minutes: number; notifications: boolean }
export type AttendanceBreakKind = 'morning_tea' | 'lunch' | 'afternoon_tea'
export interface AttendanceBreak { kind: AttendanceBreakKind; out_at: string | null; in_at: string | null; skipped?: boolean }
export interface AttendanceRecord extends Entity { clock_in_at: string; clock_out_at: string | null; work_date: string; note: string; status?: 'present' | 'absent' | 'leave' | 'holiday'; breaks?: AttendanceBreak[] }
