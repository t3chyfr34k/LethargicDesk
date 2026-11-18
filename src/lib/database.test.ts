import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { clockIn, clockOut, db, endAttendanceBreak, getAttendanceRecords, getActiveTimeEntry, markAttendanceAbsent, skipAttendanceBreak, startAttendanceBreak, startTimeEntry } from './database'

beforeEach(async()=>{await db.delete();await db.open()})
afterAll(async()=>{db.close();await db.delete()})

describe('local persistence workflows',()=>{
  it('records check-in and check-out and rejects a second active attendance record',async()=>{
    const record=await clockIn('Asia/Kolkata','Workday')
    await expect(clockIn('Asia/Kolkata')).rejects.toThrow('already clocked in')
    const closed=await clockOut(record.id)
    expect(closed.clock_out_at).not.toBeNull()
    expect((await getAttendanceRecords()).length).toBe(1)
    await expect(clockIn('Asia/Kolkata')).rejects.toThrow('already recorded')
  })
  it('allows only one running time entry at a time',async()=>{
    await startTimeEntry({description:'Writing'})
    await expect(startTimeEntry({description:'Another session'})).rejects.toThrow('already running')
    expect(await getActiveTimeEntry()).toMatchObject({description:'Writing',ended_at:null})
  })
  it('opens the current versioned database schema without discarding data',async()=>{
    await clockIn('Asia/Kolkata')
    expect(db.verno).toBe(4)
    expect((await getAttendanceRecords()).length).toBe(1)
  })
  it('enforces break out/in and prevents checkout during an open break',async()=>{
    const record=await clockIn('Asia/Kolkata')
    await startAttendanceBreak(record.id,'morning_tea')
    await expect(clockOut(record.id)).rejects.toThrow('active break')
    await endAttendanceBreak(record.id)
    await expect(clockOut(record.id)).resolves.toMatchObject({clock_out_at:expect.any(String)})
  })
  it('allows an earlier break to be skipped before recording the next break',async()=>{
    const record=await clockIn('Asia/Kolkata')
    await skipAttendanceBreak(record.id,'morning_tea')
    await expect(startAttendanceBreak(record.id,'lunch')).resolves.toMatchObject({breaks:[expect.objectContaining({kind:'morning_tea',skipped:true}),expect.objectContaining({kind:'lunch',in_at:null})]})
    await endAttendanceBreak(record.id)
    await expect(clockOut(record.id)).resolves.toMatchObject({clock_out_at:expect.any(String)})
  })
  it('records absent days without creating a second record for the same date',async()=>{
    const yesterday=new Date(Date.now()-86400000),absent=await markAttendanceAbsent('Asia/Kolkata',yesterday)
    expect(absent.status).toBe('absent')
    await expect(markAttendanceAbsent('Asia/Kolkata',yesterday)).rejects.toThrow('already recorded')
  })
  it('records leave and company holiday markers with their reason',async()=>{
    const leave=await markAttendanceAbsent('Asia/Kolkata',new Date('2026-10-20T12:00:00.000Z'),'leave','Took leave - personal')
    const holiday=await markAttendanceAbsent('Asia/Kolkata',new Date('2026-11-07T12:00:00.000Z'),'holiday','Company declared holiday - Diwali')
    expect(leave).toMatchObject({status:'leave',note:'Took leave - personal'})
    expect(holiday).toMatchObject({status:'holiday',note:'Company declared holiday - Diwali'})
  })
})
