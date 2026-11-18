import type { RealtimeChannel, User } from '@supabase/supabase-js'
import type { Table } from 'dexie'
import { db } from './database'
import { supabase } from './supabase'
import { getActiveWorkspaceId } from './workspaces'
import { getWorkspaces, replaceWorkspaces } from './workspaces'
import type { LocalFile } from '../types'

const tables = ['tasks','projects','subtasks','milestones','calendarEvents','notes','knowledgeArticles','bookmarks','files','timeEntries','focusSessions','dailyPlans','tags','preferences','attendance'] as const
type TableName = typeof tables[number]
type CloudRow = { user_id:string; workspace_id:string; collection:string; record_id:string; payload:Record<string,unknown>; updated_at:string; deleted?:boolean }
let syncing = false
let scheduled = false
let currentUser: User | null = null
let channel: RealtimeChannel | null = null
let mounted = false
let syncRequested=false
const deleteQueueKey='lethargic-desk:cloud-delete-queue:v1'
type PendingDelete={id:string;workspace_id:string;collection:string;record_id:string;updated_at:string}
function readDeletes():PendingDelete[]{try{return JSON.parse(localStorage.getItem(deleteQueueKey)??'[]') as PendingDelete[]}catch{return []}}
function saveDeletes(rows:PendingDelete[]){try{localStorage.setItem(deleteQueueKey,JSON.stringify(rows))}catch{}}
function reportStatus(status:'syncing'|'synced'|'offline'|'error'){window.dispatchEvent(new CustomEvent('cloud-sync-status',{detail:status}))}
const serialize = async (collection:TableName, value:Record<string,unknown>):Promise<Record<string,unknown>> => {
  if(collection !== 'files') return value
  const file=value as unknown as LocalFile
  if(!(file.blob instanceof Blob)) return value
  const objectPath=`${currentUser!.id}/${getActiveWorkspaceId()}/${file.id}`
  const { error }=await supabase!.storage.from('workspace-files').upload(objectPath,file.blob,{upsert:true,contentType:file.mime_type})
  if(error) throw error
  const { blob:_, ...metadata }=file
  return {...metadata, storage_path:objectPath}
}
const hydrate = async(collection:string,payload:Record<string,unknown>):Promise<Record<string,unknown>> => {
  if(collection !== 'files' || typeof payload.storage_path !== 'string') return payload
  const { data,error }=await supabase!.storage.from('workspace-files').download(payload.storage_path)
  if(error) throw error
  const { storage_path:_, ...metadata }=payload
  return {...metadata,blob:data} as Record<string,unknown>
}
async function pushLocal():Promise<void> {
  if(!supabase||!currentUser)return
  if(syncing){syncRequested=true;return}
  syncing=true
  reportStatus(navigator.onLine?'syncing':'offline')
  try {
    const workspace=getActiveWorkspaceId()
  const workspaceRows=getWorkspaces().map(item=>({user_id:currentUser!.id,workspace_id:'_account',collection:'_workspaces',record_id:item.id,payload:item as unknown as Record<string,unknown>,updated_at:item.updated_at??item.created_at}))
    const {error:workspaceError}=await supabase.from('workspace_records').upsert(workspaceRows,{onConflict:'user_id,workspace_id,collection,record_id'})
    if(workspaceError)throw workspaceError
    for(const tableName of tables){
      const table=db.table(tableName) as Table<Record<string,unknown>,string>
      const rows=await table.toArray()
      const cloudRows:CloudRow[]=[]
      for(const item of rows){
        const payload=await serialize(tableName,item)
        cloudRows.push({user_id:currentUser.id,workspace_id:workspace,collection:tableName,record_id:String(item.id),payload,updated_at:String(item.updated_at??new Date().toISOString()),deleted:false})
      }
      for(let offset=0;offset<cloudRows.length;offset+=200){const {error}=await supabase.from('workspace_records').upsert(cloudRows.slice(offset,offset+200),{onConflict:'user_id,workspace_id,collection,record_id'});if(error)throw error}
    }
    await pushDeletes()
    reportStatus(navigator.onLine?'synced':'offline')
  } finally { syncing=false;if(syncRequested&&mounted){syncRequested=false;window.setTimeout(()=>void pushLocal().catch(()=>reportStatus('error')),50)} }
}
async function pushDeletes():Promise<void>{
  if(!supabase||!currentUser)return
  for(const item of readDeletes()){
    const {error}=await supabase.from('workspace_records').upsert({user_id:currentUser.id,workspace_id:item.workspace_id,collection:item.collection,record_id:item.record_id,payload:{},updated_at:item.updated_at,deleted:true},{onConflict:'user_id,workspace_id,collection,record_id'})
    if(error)throw error
    saveDeletes(readDeletes().filter(deletion=>deletion.id!==item.id))
  }
}
async function pullRemote():Promise<void> {
  if(!supabase||!currentUser||syncing)return
  syncing=true
  try {
    const workspace=getActiveWorkspaceId()
    const {data,error}=await supabase.from('workspace_records').select('collection,record_id,payload,updated_at,deleted').eq('user_id',currentUser.id).eq('workspace_id',workspace)
    if(error)throw error
    for(const row of (data??[]) as Pick<CloudRow,'collection'|'record_id'|'payload'|'updated_at'|'deleted'>[]){
      if(!tables.includes(row.collection as TableName))continue
      const table=db.table(row.collection) as Table<Record<string,unknown>,string>
      const local=await table.get(row.record_id)
      if(local&&String(local.updated_at??'')>=row.updated_at)continue
      if(row.deleted){if(local){await table.delete(row.record_id);window.dispatchEvent(new Event('cloud-data-changed'))}continue}
      const value=await hydrate(row.collection,row.payload)
      await table.put(value)
    }
  } finally { syncing=false }
}
async function syncWorkspaceList():Promise<void>{
  if(!supabase||!currentUser)return
  const {data,error}=await supabase.from('workspace_records').select('payload').eq('user_id',currentUser.id).eq('workspace_id','_account').eq('collection','_workspaces')
  if(error)throw error
  const remote=(data??[]).map(row=>row.payload).filter((item):item is Record<string,unknown>=>!!item&&typeof item.id==='string'&&typeof item.name==='string')
  const local=getWorkspaces()
  const merged=[...remote as unknown as ReturnType<typeof getWorkspaces>]
  for(const item of local){const index=merged.findIndex(saved=>saved.id===item.id);if(index<0)merged.push(item);else if((item.updated_at??item.created_at)>(merged[index].updated_at??merged[index].created_at))merged[index]=item}
  replaceWorkspaces(merged)
  window.dispatchEvent(new Event('cloud-workspaces-changed'))
}
export async function startCloudSync(user:User):Promise<()=>void> {
  stopCloudSync(); currentUser=user; mounted=true
  reportStatus('syncing')
  await syncWorkspaceList()
  if(!supabase)return()=>{}
  channel=supabase.channel(`workspace-sync:${user.id}:${getActiveWorkspaceId()}`).on('postgres_changes',{event:'*',schema:'public',table:'workspace_records',filter:`user_id=eq.${user.id}`},(event)=>{
    const row=(event.new??event.old) as Partial<CloudRow>
    if(row.collection==='_workspaces'){
      if(event.eventType!=='DELETE')void syncWorkspaceList()
      return
    }
    if(row.workspace_id!==getActiveWorkspaceId())return
    const value=event.new as CloudRow
    if(!tables.includes(value.collection as TableName))return
    void (async()=>{syncing=true;try{const table=db.table(value.collection) as Table<Record<string,unknown>,string>;const local=await table.get(value.record_id);if(!local||String(local.updated_at??'')<value.updated_at){if(value.deleted)await table.delete(value.record_id);else await table.put(await hydrate(value.collection,value.payload));window.dispatchEvent(new Event('cloud-data-changed'))}}finally{syncing=false}})()
  }).subscribe()
  const off=attachLocalHooks()
  await pushDeletes()
  await pullRemote()
  await pushLocal()
  const onOnline=()=>{void pushDeletes().then(pullRemote).then(pushLocal).catch(()=>reportStatus('error'))}
  const onOffline=()=>reportStatus('offline')
  window.addEventListener('online',onOnline)
  window.addEventListener('offline',onOffline)
  return()=>{off();window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);stopCloudSync()}
}
function attachLocalHooks():()=>void {
  const detach:(()=>void)[]=[]
  for(const tableName of tables){
    const table=db.table(tableName)
    const schedule=()=>{if(scheduled||!mounted)return;scheduled=true;window.setTimeout(()=>{scheduled=false;void pushLocal().catch(()=>reportStatus('error'))},300)}
    const creating=(_primaryKey:unknown)=>{if(!syncing)schedule()}
    const updating=()=>{if(!syncing)schedule()}
    table.hook('creating',creating)
    table.hook('updating',updating)
    const deleting=(primaryKey:unknown)=>{if(!syncing){const workspace=getActiveWorkspaceId(),record_id=String(primaryKey),id=`${workspace}:${tableName}:${record_id}`,deletions=readDeletes();if(!deletions.some(item=>item.id===id))deletions.push({id,workspace_id:workspace,collection:tableName,record_id,updated_at:new Date().toISOString()});saveDeletes(deletions);schedule()}}
    table.hook('deleting',deleting)
    detach.push(()=>{table.hook('creating').unsubscribe(creating);table.hook('updating').unsubscribe(updating);table.hook('deleting').unsubscribe(deleting)})
  }
  return()=>detach.forEach(remove=>remove())
}
export function stopCloudSync(){mounted=false;currentUser=null;if(channel){void supabase?.removeChannel(channel);channel=null}}
export function requestCloudSync(){void pushLocal().catch(()=>reportStatus('error'))}
export async function getCloudState(){if(!supabase)return{configured:false,user:null as User|null};const {data}=await supabase.auth.getSession();return{configured:true,user:data.session?.user??null}}
