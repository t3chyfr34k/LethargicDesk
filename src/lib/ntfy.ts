import { useEffect } from 'react'

export type NtfySettings = {
  baseUrl: string
  topic?: string
  token: string
  taskReminders?: boolean
  timerCompletion?: boolean
  dailyBriefing?: boolean
  reminderTime?: string
  briefingTime?: string
  priority?: 'min' | 'low' | 'default' | 'high' | 'urgent'
  tags?: string
  clickUrl?: string
}

const settingsKey = (scope: string) => `lethargic-desk:integrations:v1:${scope}`
const cleanUrl = (value: string) => value.trim().replace(/\/+$/, '')

export function getNtfySettings(scope: string): NtfySettings | undefined {
  try {
    const values = JSON.parse(localStorage.getItem(settingsKey(scope)) ?? '{}') as { ntfy?: NtfySettings }
    return values.ntfy
  } catch { return undefined }
}

export async function publishNtfySettings(config: NtfySettings | undefined, title: string, message: string) {
  if (!config?.baseUrl || !config.topic) throw new Error('Set the ntfy server and topic, then remember the settings on this device.')
  if (!config.topic.trim() || /[\s/]/.test(config.topic)) throw new Error('The ntfy topic must be one path name without spaces or slashes.')
  const headers: Record<string, string> = { Title: title.slice(0, 250), Priority: config.priority ?? 'default', Tags: (config.tags?.trim() || 'bell').slice(0, 100) }
  if (config.clickUrl?.trim()) { const clickUrl = new URL(config.clickUrl.trim()); if (!['http:', 'https:'].includes(clickUrl.protocol)) throw new Error('The ntfy click action must use HTTP or HTTPS.'); headers.Click = clickUrl.toString() }
  if (config.token.trim()) headers.Authorization = `Bearer ${config.token.trim()}`
  let response: Response
  try {
    response = await fetch(`${cleanUrl(config.baseUrl)}/${encodeURIComponent(config.topic.trim())}`, {
      method: 'POST', headers, body: message.slice(0, 4000), signal: AbortSignal.timeout(12000),
    })
  } catch (error) {
    if (error instanceof TypeError) throw new Error('Could not reach ntfy. Check the server URL and allow browser CORS requests.', { cause: error })
    throw error
  }
  if (!response.ok) throw new Error(`ntfy returned HTTP ${response.status}. Check the topic and access token.`)
}

export async function publishNtfy(scope: string, title: string, message: string) {
  return publishNtfySettings(getNtfySettings(scope), title, message)
}

export async function notifyTimerComplete(scope: string) {
  if (getNtfySettings(scope)?.timerCompletion) await publishNtfy(scope, 'Work session complete', 'A work timer has ended. Open Lethargic Desk to review it.')
}

export function NtfyScheduler({ scope, tasks, timezone }: { scope: string; tasks: { id: string; title: string; due_date: string | null; completed: boolean }[]; timezone: string }) {
  useEffect(() => {
    const tick = () => {
      const settings = getNtfySettings(scope)
      if (!settings?.baseUrl || !settings.topic) return
      const now = new Date()
      const parts = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now)
      const part = (name:string) => parts.find(item=>item.type===name)?.value ?? '00'
      const day = `${part('year')}-${part('month')}-${part('day')}`
      const minute = `${part('hour')}:${part('minute')}`
      const sentKey = `lethargic-desk:ntfy-fired:v1:${scope}`
      let sent: string[]
      try { sent = JSON.parse(localStorage.getItem(sentKey) ?? '[]') as string[] } catch { sent = [] }
      const mark = async (id: string, title: string, message: string) => {
        if (sent.includes(id)) return
        try {
          await publishNtfy(scope, title, message)
          sent.push(id)
          localStorage.setItem(sentKey, JSON.stringify(sent.slice(-500)))
        } catch { /* Keep the item eligible so a temporary connection failure can retry next tick. */ }
      }
      if (settings.taskReminders && minute >= (settings.reminderTime || '09:00')) {
        for (const task of tasks) if (!task.completed && task.due_date === day) void mark(`task:${day}:${task.id}`, 'Task due today', 'You have a task due today. Open Lethargic Desk to view it.')
      }
      if (settings.dailyBriefing && minute >= (settings.briefingTime || '08:00') && !sent.includes(`briefing:${day}`)) {
        const due = tasks.filter(task => !task.completed && task.due_date === day)
        const overdue = tasks.filter(task => !task.completed && !!task.due_date && task.due_date < day)
        const lines = [`${due.length} task${due.length === 1 ? '' : 's'} due today`, `${overdue.length} overdue`]
        void mark(`briefing:${day}`, 'Your daily briefing', lines.join('\n'))
      }
    }
    tick()
    const interval = window.setInterval(tick, 30_000)
    return () => window.clearInterval(interval)
  }, [scope, tasks, timezone])
  return null
}
