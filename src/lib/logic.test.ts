import { describe, expect, it } from 'vitest'
import { completionRate, isOverdue, projectProgress, searchWorkspace, validateEvent } from './logic'
import type { Project, Task } from '../types'

const task=(patch:Partial<Task>={}):Task=>({id:'t1',user_id:'local',title:'Task',description:null,due_date:null,priority:'medium',completed:false,status:'todo',created_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z',...patch})
const project:Project={id:'p1',user_id:'local',name:'Project',description:null,status:'active',created_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z'}

describe('workspace business rules',()=>{
  it('does not mark completed or undated tasks overdue',()=>{
    expect(isOverdue(task({due_date:'2020-01-01',completed:true}),new Date('2026-01-01'))).toBe(false)
    expect(isOverdue(task(),new Date('2026-01-01'))).toBe(false)
  })
  it('marks past due unfinished tasks overdue',()=>expect(isOverdue(task({due_date:'2025-12-31'}),new Date('2026-01-01T12:00:00'))).toBe(true))
  it('calculates bounded completion rates for empty and populated lists',()=>{
    expect(completionRate([])).toBe(0)
    expect(completionRate([task({completed:true}),task({id:'t2',completed:true})])).toBe(100)
  })
  it('calculates project progress from non-cancelled linked tasks',()=>{
    expect(projectProgress(project,[task({project_id:'p1',completed:true}),task({id:'t2',project_id:'p1'}),task({id:'t3',project_id:'p1',status:'cancelled'})])).toBe(50)
    expect(projectProgress(project,[])).toBe(0)
  })
  it('rejects invalid and non-positive calendar intervals',()=>{
    expect(()=>validateEvent('2026-01-01T10:00:00Z','2026-01-01T11:00:00Z')).not.toThrow()
    expect(()=>validateEvent('invalid','2026-01-01T11:00:00Z')).toThrow()
    expect(()=>validateEvent('2026-01-01T11:00:00Z','2026-01-01T11:00:00Z')).toThrow()
  })
  it('searches partial matches without regard to case',()=>expect(searchWorkspace({tasks:[task()]},'tasK',(t)=>t.title)).toHaveProperty('tasks'))
})
