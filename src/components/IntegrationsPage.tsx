import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ExternalLink, Eye, EyeOff, RefreshCw, ShieldCheck, Unplug, Wifi, WifiOff } from 'lucide-react'
import type { CalendarEvent } from '../types'
import { parseCalDavEvents, serializeCalDavEvent } from '../lib/caldav'
import { publishNtfySettings } from '../lib/ntfy'

type Provider = 'vikunja' | 'forgejo' | 'nextcloud' | 'ntfy' | 'radicale'
type Settings = { baseUrl: string; username: string; token: string; topic?: string; taskReminders?: boolean; timerCompletion?: boolean; dailyBriefing?: boolean; reminderTime?: string; briefingTime?: string; priority?: 'min'|'low'|'default'|'high'|'urgent'; tags?: string; clickUrl?: string; caldavSyncDirection?: 'import'|'export'|'both' }
const publishNtfyFromSettings = publishNtfySettings
type ProviderState = { settings: Settings; remember: boolean; status: 'idle' | 'checking' | 'connected' | 'error'; message: string; busy: boolean; data: Record<string, unknown>[] }
const providers: { id: Provider; name: string; summary: string; authHint: string; tokenLabel: string; tokenType?: string; suggestedBase?: string }[] = [
  { id: 'vikunja', name: 'Vikunja', summary: 'Bring your projects and tasks into your workspace.', authHint: 'Default is Vikunja Cloud. Change the address for a self-hosted instance. Create an API token in Settings → API Tokens.', tokenLabel: 'API token', suggestedBase: 'https://app.vikunja.cloud' },
  { id: 'forgejo', name: 'Forgejo', summary: 'Turn open repository issues into tasks.', authHint: 'Default is Codeberg, a public Forgejo host. Change the address for another instance. Create a token in Settings → Applications.', tokenLabel: 'Access token', suggestedBase: 'https://codeberg.org' },
  { id: 'nextcloud', name: 'Nextcloud', summary: 'Browse your WebDAV files and import text notes.', authHint: 'Enter your Nextcloud provider’s server address (there is no universal host). Use your username and an app password from Personal settings → Security.', tokenLabel: 'App password', tokenType: 'password' },
  { id: 'ntfy', name: 'Push notifications · ntfy', summary: 'Send task reminders, timer completion alerts, and your daily briefing to phones or desktops subscribed to your topic.', authHint: 'Use the ntfy app or web client to subscribe to this topic. Public ntfy topics are discoverable; choose a long, unguessable topic or use an authenticated self-hosted server.', tokenLabel: 'Access token (optional)', tokenType: 'password', suggestedBase: 'https://ntfy.sh' },
  { id: 'radicale', name: 'Calendar sync · Radicale', summary: 'Import events from your CalDAV calendar and publish workspace events so other calendar apps can see them.', authHint: 'Enter the full calendar collection URL from your Radicale server. Use the same username and password you use in your calendar client.', tokenLabel: 'Password', tokenType: 'password', suggestedBase: 'http://127.0.0.1:5232/lethargicdesk/calendar/' },
]
const emptySettings: Settings = { baseUrl: '', username: '', token: '' }
const cleanUrl = (value: string) => value.trim().replace(/\/+$/, '')
const storedKey = (scope: string) => `lethargic-desk:integrations:v1:${scope}`
const safeStored = (scope: string): Partial<Record<Provider, Settings>> => { try { return JSON.parse(localStorage.getItem(storedKey(scope)) ?? '{}') as Partial<Record<Provider, Settings>> } catch { return {} } }
const initialStates = (scope: string): Record<Provider, ProviderState> => { const saved = safeStored(scope); const make = (id: Provider): ProviderState => { const suggestedBase = providers.find(provider => provider.id === id)?.suggestedBase ?? ''; const defaults = id === 'ntfy' ? {taskReminders:true,timerCompletion:true,dailyBriefing:true,reminderTime:'09:00',briefingTime:'08:00',priority:'default' as const,tags:'bell'} : {}; const initial = { ...emptySettings, ...defaults, baseUrl: suggestedBase, ...(id === 'radicale' ? { username: 'lethargicdesk' } : {}) }; const settings = saved[id] ? { ...initial, ...saved[id], baseUrl: saved[id].baseUrl || suggestedBase, username: saved[id].username || initial.username } : initial; return { settings, remember: !!saved[id], status: 'idle', message: '', busy: false, data: [] } }; return { vikunja: make('vikunja'), forgejo: make('forgejo'), nextcloud: make('nextcloud'), ntfy: make('ntfy'), radicale: make('radicale') } }
const importKey = (scope: string) => `${storedKey(scope)}:imported`
const basicAuth = (username: string, password: string) => `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${username}:${password}`)))}`
const safeJson = async (response: Response) => { const text = await response.text(); let body: unknown; try { body = text ? JSON.parse(text) : null } catch { body = text }; if (!response.ok) { const detail = typeof body === 'object' && body && 'message' in body ? String((body as {message:unknown}).message) : `HTTP ${response.status}`; throw new Error(detail) }; return body }
const request = async (url: string, headers: HeadersInit, init: RequestInit = {}) => { let response: Response; try { response = await fetch(url, { ...init, headers: { Accept: 'application/json', ...headers, ...init.headers }, signal: AbortSignal.timeout(15000) }) } catch (error) { if (error instanceof TypeError) throw new Error('Could not reach the service. Check the address, HTTPS, network, and whether its administrator allows browser CORS requests.', { cause: error }); throw error }; return safeJson(response) }
const asRows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []
const asPageRows = (value: unknown): Record<string, unknown>[] => { if (Array.isArray(value)) return asRows(value); if (value && typeof value === 'object' && 'items' in value) return asRows((value as { items: unknown }).items); return [] }
const text = (value: unknown) => typeof value === 'string' ? value : ''

export function IntegrationsPage({ scope, onAddTask, onAddNote, events, onAddEvent, onSaveEvent }: { scope: string; onAddTask: (title: string, due?: string) => Promise<void>; onAddNote: (title: string, body: string) => Promise<void>; events: CalendarEvent[]; onAddEvent: (event: Omit<CalendarEvent,'id'|'created_at'|'updated_at'>) => Promise<CalendarEvent>; onSaveEvent: (event: CalendarEvent) => Promise<CalendarEvent> }) {
  const [states, setStates] = useState<Record<Provider, ProviderState>>(() => initialStates(scope))
  const [showSecrets, setShowSecrets] = useState<Record<Provider, boolean>>({ vikunja: false, forgejo: false, nextcloud: false, ntfy: false, radicale: false })
  const [selected, setSelected] = useState<Record<Provider, string>>({ vikunja: '', forgejo: '', nextcloud: '', ntfy: '', radicale: '' })
  const [notice, setNotice] = useState('')
  useEffect(() => { setStates(initialStates(scope)) }, [scope])
  const update = (id: Provider, change: Partial<ProviderState>) => setStates(old => { const next = { ...old[id], ...change }; if ('settings' in change || 'remember' in change) { const all = Object.fromEntries(providers.map(({ id: key }) => [key, key === id ? (next.remember ? next.settings : undefined) : old[key].remember ? old[key].settings : undefined]).filter(([, value]) => value)) as Partial<Record<Provider, Settings>>; try { localStorage.setItem(storedKey(scope), JSON.stringify(all)) } catch { /* settings still work for this page session */ } }; return { ...old, [id]: next } })
  const api = async (id: Provider, path: string, init?: RequestInit) => {
    const { baseUrl, token } = states[id].settings; const base = cleanUrl(baseUrl)
    if (!/^https?:\/\//i.test(base)) throw new Error('Enter a complete http:// or https:// service address.')
    if (!token.trim()) throw new Error(`Enter your ${id === 'nextcloud' ? 'app password' : 'API token'} first.`)
    const auth = id === 'forgejo' ? `token ${token.trim()}` : `Bearer ${token.trim()}`
    return request(`${base}${path}`, { Authorization: auth }, init)
  }
  const alreadyImported = (provider: Provider, externalId: unknown) => { try { const known = JSON.parse(localStorage.getItem(importKey(scope)) ?? '{}') as Record<string, string[]>; return known[provider]?.includes(String(externalId)) ?? false } catch { return false } }
  const markImported = (provider: Provider, externalIds: unknown[]) => { try { const known = JSON.parse(localStorage.getItem(importKey(scope)) ?? '{}') as Record<string, string[]>; const ids = new Set(known[provider] ?? []); externalIds.forEach(id => ids.add(String(id))); localStorage.setItem(importKey(scope), JSON.stringify({ ...known, [provider]: [...ids] })) } catch { /* import is still complete if browser storage is unavailable */ } }
  const check = async (id: Provider) => {
    update(id, { status: 'checking', message: '', busy: true, data: [] }); setNotice('')
    try {
      if (id === 'ntfy') {
        const {baseUrl,topic}=states[id].settings
        if(!topic?.trim())throw new Error('Choose an ntfy topic first.')
        if(!/^https?:\/\//i.test(cleanUrl(baseUrl)))throw new Error('Enter a complete http:// or https:// ntfy server address.')
        await publishNtfyFromSettings(states[id].settings,'Lethargic Desk test','Push notifications are connected to this workspace.')
        update(id,{status:'connected',message:'Test notification sent. Subscribe to this topic in ntfy to receive alerts.',busy:false});return
      }
      if (id === 'radicale') {
        const {baseUrl,username,token}=states[id].settings
        if(!username.trim()||!token)throw new Error('Enter your Radicale username and password.')
        if(!/^https?:\/\//i.test(cleanUrl(baseUrl)))throw new Error('Enter your full CalDAV calendar collection URL.')
        const response=await fetch(cleanUrl(baseUrl),{method:'PROPFIND',headers:{Authorization:basicAuth(username.trim(),token),Depth:'0','Content-Type':'application/xml'},body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:displayname/><d:supported-report-set/></d:prop></d:propfind>',signal:AbortSignal.timeout(15000)})
        if(response.status!==207)throw new Error(`CalDAV returned HTTP ${response.status}. Check the URL, credentials, and server CORS settings.`)
        update(id,{status:'connected',message:'CalDAV calendar connected.',busy:false});return
      }
      if (id === 'vikunja') { const user = await api(id, '/api/v2/user'); update(id, { status: 'connected', message: `Connected${user && typeof user === 'object' && 'username' in user ? ` as ${String(user.username)}` : ''}.`, busy: false }) }
      else if (id === 'forgejo') { const user = await api(id, '/api/v1/user'); update(id, { status: 'connected', message: `Connected${user && typeof user === 'object' && 'login' in user ? ` as ${String(user.login)}` : ''}.`, busy: false }) }
      else {
        const { baseUrl, username, token } = states[id].settings; if (!username.trim()) throw new Error('Enter your Nextcloud username.')
        const base = cleanUrl(baseUrl); if (!/^https?:\/\//i.test(base)) throw new Error('Enter a complete http:// or https:// service address.')
        const auth = basicAuth(username.trim(), token)
        const result = await request(`${base}/remote.php/dav/files/${encodeURIComponent(username.trim())}/`, { Authorization: auth, Depth: '1' }, { method: 'PROPFIND', body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>', headers: { 'Content-Type': 'application/xml' } })
        update(id, { status: 'connected', message: `WebDAV connected.`, busy: false, data: asRows(result) })
      }
    } catch (error) { update(id, { status: 'error', message: error instanceof Error ? error.message : 'Connection failed.', busy: false }) }
  }
  const load = async (id: Provider) => {
    update(id, { busy: true, message: '', data: [] }); setNotice('')
    try {
      if (id === 'vikunja') { const response = await api(id, '/api/v2/projects?page=1&per_page=50'); const rows = asPageRows(response); update(id, { data: rows, busy: false, status: 'connected', message: rows.length ? `${rows.length} projects loaded.` : 'Connected. No projects found.' }) }
      else if (id === 'forgejo') { const rows = asRows(await api(id, '/api/v1/user/repos?limit=50')); update(id, { data: rows, busy: false, status: 'connected', message: rows.length ? `${rows.length} repositories loaded.` : 'Connected. No repositories found.' }) }
      else {
        const { baseUrl, username, token } = states[id].settings; const base = cleanUrl(baseUrl); const auth = basicAuth(username.trim(), token)
        const response = await fetch(`${base}/remote.php/dav/files/${encodeURIComponent(username.trim())}/`, { method: 'PROPFIND', headers: { Authorization: auth, Depth: '1', 'Content-Type': 'application/xml' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>', signal: AbortSignal.timeout(15000) })
        if (!response.ok && response.status !== 207) throw new Error(`WebDAV returned HTTP ${response.status}.`)
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml'); const dav = (node: Element, tag: string) => node.getElementsByTagNameNS('DAV:', tag)[0]?.textContent ?? ''; const rows = [...xml.getElementsByTagNameNS('DAV:', 'response')].slice(1).map(node => ({ name: dav(node, 'displayname') || decodeURIComponent(dav(node, 'href').split('/').filter(Boolean).pop() ?? ''), href: dav(node, 'href'), isDirectory: node.getElementsByTagNameNS('DAV:', 'collection').length > 0, size: Number(dav(node, 'getcontentlength') || 0) }))
        update(id, { data: rows, busy: false, status: 'connected', message: `${rows.length} files and folders loaded.` })
      }
    } catch (error) { update(id, { busy: false, status: 'error', message: error instanceof Error ? error.message : 'Could not load service data.' }) }
  }
  const syncRadicale = async () => {
    const id: Provider='radicale',config=states.radicale.settings,base=cleanUrl(config.baseUrl),auth=basicAuth(config.username.trim(),config.token)
    const direction=config.caldavSyncDirection??'import',canImport=direction!=='export',canExport=direction!=='import'
    update(id,{busy:true,message:'',status:'checking'});setNotice('')
    try {
      if(!config.username.trim()||!config.token||!base)throw new Error('Enter a CalDAV collection URL, username, and password first.')
      const root=new URL(`${base}/`)
      const listing=await fetch(base,{method:'PROPFIND',headers:{Authorization:auth,Depth:'1','Content-Type':'application/xml'},body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/></d:prop></d:propfind>',signal:AbortSignal.timeout(20000)})
      if(listing.status!==207)throw new Error(`CalDAV listing returned HTTP ${listing.status}. Check the calendar collection URL and CORS settings.`)
      const listingXml=new DOMParser().parseFromString(await listing.text(),'application/xml')
      const hrefs=[...listingXml.getElementsByTagNameNS('DAV:','response')].map(node=>node.getElementsByTagNameNS('DAV:','href')[0]?.textContent??'').filter(href=>href&&href.toLowerCase().endsWith('.ics')).slice(0,500)
      const remote: {href:string;event:ReturnType<typeof parseCalDavEvents>[number]}[]=[]
      for(const href of hrefs){
        const target=new URL(href,root)
        if(target.origin!==root.origin||!target.pathname.startsWith(root.pathname))throw new Error('Radicale returned an event link outside the selected calendar. It was blocked.')
        const response=await fetch(target,{headers:{Authorization:auth,Accept:'text/calendar'},signal:AbortSignal.timeout(15000)})
        if(!response.ok)throw new Error(`Could not read a calendar event (HTTP ${response.status}).`)
        for(const event of parseCalDavEvents(await response.text()))remote.push({href:target.href,event})
      }
      const mapKey=`${storedKey(scope)}:radicale-map`,mapping=(()=>{try{return JSON.parse(localStorage.getItem(mapKey)??'{}') as Record<string,{uid:string;href:string;syncedAt:string}>}catch{return {}}})()
      const mappingByUid=new Map(Object.entries(mapping).map(([localId,value])=>[value.uid,{localId,...value}]))
      const remoteByUid=new Map(remote.map(item=>[item.event.uid,item]))
      const localById=new Map(events.map(event=>[event.id,event]))
      if(canImport&&canExport)for(const [localId,link] of Object.entries(mapping)){const local=localById.get(localId),incoming=remoteByUid.get(link.uid);if(!local||!incoming||local.updated_at===link.syncedAt)continue;const remoteChanged=incoming.event.title!==local.title||incoming.event.starts_at!==local.starts_at||incoming.event.ends_at!==local.ends_at||incoming.event.description!==(local.description??'')||incoming.event.recurrence!==(local.recurrence??null);if(remoteChanged)throw new Error(`Sync conflict for “${local.title}”: both local and remote copies changed. No automatic overwrite was made.`)}
      let imported=0,exported=0,updated=0
      for(const [localId,link] of Object.entries(mapping)){
        const local=localById.get(localId),incoming=remoteByUid.get(link.uid)
        if(local?.deleted_at){if(canExport){const response=await fetch(incoming?.href??link.href,{method:'DELETE',headers:{Authorization:auth},signal:AbortSignal.timeout(15000)});if(!response.ok&&response.status!==404&&response.status!==410)throw new Error(`Could not delete removed event “${local.title}” from Radicale (HTTP ${response.status}).`);delete mapping[localId]}continue}
        if(!local)continue
        const remoteChanged=!!incoming&&(incoming.event.title!==local.title||incoming.event.starts_at!==local.starts_at||incoming.event.ends_at!==local.ends_at||incoming.event.description!==(local.description??'')||incoming.event.recurrence!==(local.recurrence??null))
        if(remoteChanged&&local.updated_at!==link.syncedAt)throw new Error(`Sync conflict for “${local.title}”: both local and remote copies changed. No automatic overwrite was made.`)
        if(canExport&&local.updated_at!==link.syncedAt){
          const href=incoming?.href??link.href
          const response=await fetch(href,{method:'PUT',headers:{Authorization:auth,'Content-Type':'text/calendar; charset=utf-8'},body:serializeCalDavEvent(local,link.uid),signal:AbortSignal.timeout(15000)})
          if(!response.ok)throw new Error(`Could not publish “${local.title}” (HTTP ${response.status}).`)
          mapping[localId]={...link,href,syncedAt:local.updated_at};exported++
        }else if(canImport&&remoteChanged&&incoming){
          const next=await onSaveEvent({...local,title:incoming.event.title,description:incoming.event.description,starts_at:incoming.event.starts_at,ends_at:incoming.event.ends_at,all_day:incoming.event.all_day,recurrence:incoming.event.recurrence})
          mapping[localId]={...link,href:incoming.href,syncedAt:next.updated_at};updated++
        }
      }
      for(const item of remote){
        if(!canImport)continue
        if(mappingByUid.has(item.event.uid))continue
        const created=await onAddEvent({title:item.event.title,description:item.event.description,starts_at:item.event.starts_at,ends_at:item.event.ends_at,all_day:item.event.all_day,task_id:null,recurrence:item.event.recurrence})
        mapping[created.id]={uid:item.event.uid,href:item.href,syncedAt:created.updated_at};imported++
      }
      const knownIds=new Set(Object.keys(mapping))
      for(const local of events){
        if(!canExport)continue
        if(knownIds.has(local.id)||local.deleted_at)continue
        const uid=`${local.id}@lethargic-desk`,href=new URL(`${encodeURIComponent(uid)}.ics`,`${base}/`).href
        const response=await fetch(href,{method:'PUT',headers:{Authorization:auth,'Content-Type':'text/calendar; charset=utf-8','If-None-Match':'*'},body:serializeCalDavEvent(local,uid),signal:AbortSignal.timeout(15000)})
        if(!response.ok&&response.status!==412)throw new Error(`Could not publish “${local.title}” (HTTP ${response.status}).`)
        mapping[local.id]={uid,href,syncedAt:local.updated_at};exported++
      }
      localStorage.setItem(mapKey,JSON.stringify(mapping))
      update(id,{busy:false,status:'connected',message:`Calendar synced: ${imported} imported, ${exported} sent, ${updated} updated. Remote deletions are left untouched.`})
    }catch(error){update(id,{busy:false,status:'error',message:error instanceof Error?error.message:'CalDAV sync failed.'})}
  }
  const importSelected = async (id: Provider) => {
    const row = states[id].data.find(item => String(item.id ?? item.repository_id ?? item.href) === selected[id]); if (!row) return
    update(id, { busy: true }); setNotice('')
    try {
      if (id === 'vikunja') {
        const projectId = Number(row.id); const tasks = asPageRows(await api(id, `/api/v2/projects/${projectId}/tasks?page=1&per_page=50&filter=${encodeURIComponent('done = false')}`)); let count = 0; const imported: unknown[] = []
        for (const item of tasks) { const title = text(item.title).trim(); if (title && !item.done && !alreadyImported(id, item.id)) { await onAddTask(title, text(item.due_date).slice(0, 10) || undefined); imported.push(item.id); count++ } }
        markImported(id, imported)
        setNotice(`Imported ${count} open task${count === 1 ? '' : 's'} from ${text(row.title) || 'Vikunja'}.`)
      } else if (id === 'forgejo') {
        const owner = text((row.owner as Record<string, unknown> | undefined)?.login); const repo = text(row.name); if (!owner || !repo) throw new Error('This repository did not include a usable owner and name.')
        const issues = asRows(await api(id, `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&type=issues&limit=50`)); let count = 0; const imported: unknown[] = []
        for (const issue of issues) { const title = text(issue.title).trim(); if (title && !issue.pull_request && !alreadyImported(id, `${owner}/${repo}#${String(issue.number)}`)) { await onAddTask(`[${owner}/${repo}#${String(issue.number)}] ${title}`); imported.push(`${owner}/${repo}#${String(issue.number)}`); count++ } }
        markImported(id, imported)
        setNotice(`Imported ${count} open issue${count === 1 ? '' : 's'} from ${owner}/${repo}.`)
      } else {
        const href = text(row.href); const { baseUrl, username, token } = states[id].settings; if (!href || row.isDirectory) throw new Error('Select a text or Markdown file, not a folder.')
        const base = new URL(`${cleanUrl(baseUrl)}/`); const path = new URL(href, base); const davRoot = `${base.pathname.replace(/\/+$/, '')}/remote.php/dav/files/${encodeURIComponent(username.trim())}/`; if (path.origin !== base.origin || !path.pathname.startsWith(davRoot)) throw new Error('The selected file link is outside this Nextcloud account, so it was blocked.'); const response = await fetch(path, { headers: { Authorization: basicAuth(username.trim(), token) }, signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`File download returned HTTP ${response.status}.`)
        if (alreadyImported(id, href)) throw new Error('This file has already been imported into this workspace.'); const body = await response.text(); if (body.length > 1_000_000) throw new Error('This file is over 1 MB and was not imported.'); const title = text(row.name).replace(/\.(md|txt|markdown)$/i, '') || 'Imported note'; await onAddNote(title, body); markImported(id, [href]); setNotice(`Imported “${title}” as a note.`)
      }
      update(id, { busy: false })
    } catch (error) { update(id, { busy: false, status: 'error', message: error instanceof Error ? error.message : 'Import failed.' }) }
  }
  const visibleProviders = useMemo(() => providers, [])
  return <>
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE / PRODUCTIVITY</div><h1>Integrations</h1><p>Connect open-source tools you host or use. Choose an instance, add an API credential, then test and import data.</p></div></div>
    <div className="integration-security-note"><ShieldCheck size={17}/><span><b>Credentials stay on this device.</b> They are never sent to Lethargic Desk or Supabase. “Remember” stores settings in this browser’s local storage. Scheduled ntfy alerts run while the app is open, so keep the ntfy settings remembered on this device. Connected services must allow browser CORS requests.</span></div>
    {notice&&<p className="integration-notice-success" role="status">{notice}</p>}
    <div className="integration-grid">
      {visibleProviders.map(provider => { const state = states[provider.id]; const selectedRow = state.data.find(item => String(item.id ?? item.repository_id ?? item.href) === selected[provider.id]); const importable = provider.id === 'vikunja' ? !!selectedRow : provider.id === 'forgejo' ? !!selectedRow : !!selectedRow && !selectedRow.isDirectory && /\.(md|txt|markdown)$/i.test(text(selectedRow.name)); return <article className="integration-card integration-active-card" key={provider.id}>
        <div className="integration-card-top"><span className={`integration-state-dot ${state.status}`} aria-hidden="true"/>{state.status === 'connected' ? <span className="integration-state connected">CONNECTED</span> : state.status === 'error' ? <span className="integration-state error">ACTION NEEDED</span> : <span className="integration-state">NOT CONNECTED</span>}</div>
        <h2>{provider.name}</h2><p>{provider.summary}</p>
        <div className="integration-config">
          <label className="integration-field">{provider.id==='radicale'?'CalDAV calendar collection URL':'Instance base URL'}<input type="url" placeholder={provider.id==='ntfy'?'https://ntfy.sh':provider.id==='radicale'?'https://calendar.example.com/user/calendar/':'https://'} value={state.settings.baseUrl} onChange={e=>update(provider.id,{settings:{...state.settings,baseUrl:e.target.value},status:'idle',message:''})}/><small>{provider.id==='vikunja'?'Vikunja API v2 paths such as /api/v2 are added automatically.':provider.id==='forgejo'?'/api/v1 is added automatically.':provider.id==='nextcloud'?'/remote.php/dav/files/{username}/ is added automatically; do not include it here.':provider.id==='radicale'?'Paste the full URL of the calendar collection, including its trailing slash.':'Use ntfy.sh or your self-hosted ntfy server.'}</small></label>
          {provider.id === 'nextcloud' && <label className="integration-field">Username<input autoComplete="username" value={state.settings.username} onChange={e=>update(provider.id,{settings:{...state.settings,username:e.target.value},status:'idle',message:''})}/></label>}
          {provider.id === 'radicale' && <label className="integration-field">Username<input autoComplete="username" value={state.settings.username} onChange={e=>update(provider.id,{settings:{...state.settings,username:e.target.value},status:'idle',message:''})}/></label>}
          {provider.id === 'radicale' && <label className="integration-field">Synchronization direction<select value={state.settings.caldavSyncDirection??'import'} onChange={e=>update(provider.id,{settings:{...state.settings,caldavSyncDirection:e.target.value as Settings['caldavSyncDirection']},status:'idle',message:''})}><option value="import">Import only (CalDAV to Lethargic Desk)</option><option value="export">Export only (Lethargic Desk to CalDAV)</option><option value="both">Two-way sync</option></select><small>New connections default to import-only. Two-way sync stops with an error if both copies changed since the last sync.</small></label>}
          {provider.id === 'ntfy' && <label className="integration-field">Topic name<input value={state.settings.topic??''} onChange={e=>update(provider.id,{settings:{...state.settings,topic:e.target.value},status:'idle',message:''})} placeholder="Choose a long, unguessable topic"/><small>Subscribe to the same topic in the ntfy app or web client on each device.</small></label>}
          <label className="integration-field">{provider.tokenLabel}<span className="integration-secret-wrap"><input type={showSecrets[provider.id]?'text':(provider.tokenType ?? 'password')} autoComplete="off" value={state.settings.token} onChange={e=>update(provider.id,{settings:{...state.settings,token:e.target.value},status:'idle',message:''})}/><button type="button" aria-label={showSecrets[provider.id]?'Hide credential':'Show credential'} onClick={()=>setShowSecrets(old=>({...old,[provider.id]:!old[provider.id]}))}>{showSecrets[provider.id]?<EyeOff size={14}/>:<Eye size={14}/>}</button></span></label>
          {provider.id === 'ntfy' && <div className="ntfy-options"><label><input type="checkbox" checked={state.settings.taskReminders??true} onChange={e=>update(provider.id,{settings:{...state.settings,taskReminders:e.target.checked}})}/> Due task reminders</label><label>Send at<input type="time" value={state.settings.reminderTime??'09:00'} onChange={e=>update(provider.id,{settings:{...state.settings,reminderTime:e.target.value}})}/></label><label><input type="checkbox" checked={state.settings.timerCompletion??true} onChange={e=>update(provider.id,{settings:{...state.settings,timerCompletion:e.target.checked}})}/> Timer completion alerts</label><label><input type="checkbox" checked={state.settings.dailyBriefing??true} onChange={e=>update(provider.id,{settings:{...state.settings,dailyBriefing:e.target.checked}})}/> Daily briefing</label><label>Briefing at<input type="time" value={state.settings.briefingTime??'08:00'} onChange={e=>update(provider.id,{settings:{...state.settings,briefingTime:e.target.value}})}/></label><label>Default priority<select value={state.settings.priority??'default'} onChange={e=>update(provider.id,{settings:{...state.settings,priority:e.target.value as Settings['priority']}})}><option value="min">Min</option><option value="low">Low</option><option value="default">Default</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Tags<input value={state.settings.tags??'bell'} onChange={e=>update(provider.id,{settings:{...state.settings,tags:e.target.value}})} placeholder="bell,calendar"/></label><label>Click action URL (optional)<input type="url" value={state.settings.clickUrl??''} onChange={e=>update(provider.id,{settings:{...state.settings,clickUrl:e.target.value}})} placeholder="https://your-app.example"/></label></div>}
          <small>{provider.authHint}</small><label className="integration-remember"><input type="checkbox" checked={state.remember} onChange={e=>update(provider.id,{remember:e.target.checked})}/> Remember credentials on this device</label>
        </div>
        {state.message&&<p className={`integration-result ${state.status}`} role={state.status==='error'?'alert':'status'}>{state.status==='connected'?<Wifi size={14}/>:state.status==='error'?<WifiOff size={14}/>:null}{state.message}</p>}
        {state.data.length>0&&<div className="integration-sync-controls"><label className="integration-field">{provider.id==='vikunja'?'Project':provider.id==='forgejo'?'Repository':'Text or Markdown file'}<select value={selected[provider.id]} onChange={e=>setSelected(old=>({...old,[provider.id]:e.target.value}))}><option value="">Choose…</option>{state.data.filter(row=>provider.id!=='nextcloud'||(!row.isDirectory&&/\.(md|txt|markdown)$/i.test(text(row.name)))).map(row=><option key={String(row.id??row.href)} value={String(row.id??row.repository_id??row.href)}>{text(row.title)||text(row.full_name)||text(row.name)||'Untitled'}</option>)}</select></label></div>}
        <div className="integration-card-actions">{provider.id==='radicale'?<><button className="today-button" type="button" disabled={state.busy} onClick={()=>void check(provider.id)}><Wifi size={13}/> Test connection</button><button className="today-button" type="button" disabled={state.busy||state.status!=='connected'} onClick={()=>void syncRadicale()}><RefreshCw size={13}/> Sync calendar now</button></>:provider.id==='ntfy'?<button className="today-button" type="button" disabled={state.busy} onClick={()=>void check(provider.id)}><Wifi size={13}/> Send test notification</button>:<><button className="today-button" type="button" disabled={state.busy} onClick={()=>void check(provider.id)}>{state.busy?<RefreshCw size={13} className="integration-spinning"/>:<Wifi size={13}/>} Test connection</button><button className="today-button" type="button" disabled={state.busy||state.status!=='connected'} onClick={()=>void load(provider.id)}><RefreshCw size={13}/> {provider.id==='nextcloud'?'List files':provider.id==='forgejo'?'Load repositories':'Load projects'}</button>{state.data.length>0&&provider.id!=='nextcloud'&&<button className="today-button" type="button" disabled={state.busy||!importable} onClick={()=>void importSelected(provider.id)}><ArrowDownToLine size={13}/> Import selected</button>}{provider.id==='nextcloud'&&state.data.length>0&&<button className="today-button" type="button" disabled={state.busy||!importable} onClick={()=>void importSelected(provider.id)}><ArrowDownToLine size={13}/> Import as note</button>}</>}</div>
        <a className="integration-provider-link" href={provider.id==='vikunja'?'https://vikunja.io/docs/api-v2/':provider.id==='forgejo'?'https://forgejo.org/docs/latest/user/api/usage/':provider.id==='nextcloud'?'https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/basic.html':provider.id==='ntfy'?'https://docs.ntfy.sh/publish/':'https://radicale.org/v3.html'} target="_blank" rel="noreferrer">Setup and API docs <ExternalLink size={12}/></a>
      </article> })}
    </div>
    <p className="integration-footnote"><Unplug size={14}/> Disconnect by clearing the credential field. Imported items are copied into this workspace and can be edited independently. Imports may create duplicates if repeated.</p>
  </>
}
