import type { CalendarEvent } from '../types'

export type ParsedCalDavEvent = { uid: string; title: string; description: string; starts_at: string; ends_at: string; all_day: boolean; recurrence: string | null }

const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
const unescapeText = (value: string) => value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
const utcStamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

export function serializeCalDavEvent(event: CalendarEvent, uid: string) {
  const startDate = new Date(event.starts_at), endDate = new Date(event.ends_at)
  const dateValue = (value: Date) => `${value.getFullYear()}${String(value.getMonth()+1).padStart(2,'0')}${String(value.getDate()).padStart(2,'0')}`
  const start = event.all_day ? `DTSTART;VALUE=DATE:${dateValue(startDate)}` : `DTSTART:${utcStamp(event.starts_at)}`
  const end = event.all_day ? `DTEND;VALUE=DATE:${dateValue(endDate)}` : `DTEND:${utcStamp(event.ends_at)}`
  const now = utcStamp(new Date().toISOString())
  const rule=event.recurrence==='daily'?'RRULE:FREQ=DAILY':event.recurrence==='weekly'?'RRULE:FREQ=WEEKLY':event.recurrence==='weekdays'?'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR':null
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lethargic Desk//CalDAV Sync//EN','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${now}`,`SUMMARY:${escapeText(event.title)}`,...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),...(rule?[rule]:[]),start,end,'END:VEVENT','END:VCALENDAR',''].join('\r\n')
}

function parseDate(value: string, allDay: boolean) {
  const raw = value.trim()
  if (allDay && /^\d{8}$/.test(raw)) return new Date(Number(raw.slice(0,4)),Number(raw.slice(4,6))-1,Number(raw.slice(6,8))).toISOString()
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!match) return ''
  const [,year,month,day,hour,minute,second,zone] = match
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${zone ? 'Z' : ''}`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function parseCalDavEvents(calendarData: string): ParsedCalDavEvent[] {
  const lines = calendarData.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const blocks: string[][] = []
  let current: string[] | undefined
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = []
    else if (line === 'END:VEVENT') { if (current) blocks.push(current); current = undefined }
    else if (current) current.push(line)
  }
  return blocks.flatMap(block => {
    const fields = new Map<string, { value: string; params: string }>()
    for (const line of block) {
      const split = line.indexOf(':')
      if (split < 0) continue
      const [name, ...params] = line.slice(0, split).split(';')
      fields.set(name.toUpperCase(), { value: line.slice(split+1), params: params.join(';').toUpperCase() })
    }
    const uid = fields.get('UID')?.value.trim()
    const start = fields.get('DTSTART'), end = fields.get('DTEND')
    if (!uid || !start) return []
    const allDay = start.params.includes('VALUE=DATE')
    const starts_at = parseDate(start.value, allDay)
    const ends_at = parseDate(end?.value ?? start.value, allDay)
    if (!starts_at || !ends_at) return []
    const rule=fields.get('RRULE')?.value.toUpperCase()??''
    const recurrence=rule.includes('FREQ=DAILY')?'daily':rule.includes('BYDAY=MO,TU,WE,TH,FR')?'weekdays':rule.includes('FREQ=WEEKLY')?'weekly':null
    return [{ uid, title: unescapeText(fields.get('SUMMARY')?.value ?? 'Untitled event'), description: unescapeText(fields.get('DESCRIPTION')?.value ?? ''), starts_at, ends_at, all_day: allDay, recurrence }]
  })
}

