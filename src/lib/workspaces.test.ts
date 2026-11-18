import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, WorkspaceDatabase } from './database'
import { createCompanyWorkspace, getActiveWorkspaceId, getEmploymentTenure, getWorkspaceDatabaseName, getWorkspaces, selectWorkspace } from './workspaces'

beforeEach(() => localStorage.clear())

describe('isolated local workspaces', () => {
  it('keeps the existing local database mapped to Personal', () => {
    expect(getWorkspaces()).toMatchObject([{ id: 'personal', type: 'personal', name: 'Personal' }])
    expect(getWorkspaceDatabaseName('personal')).toBe('lethargic-desk')
  })

  it('creates separate company database names and selects them explicitly', () => {
    const company = createCompanyWorkspace('Northwind', 'Designer', '2025-06-01')
    expect(getWorkspaceDatabaseName(company.id)).not.toBe(getWorkspaceDatabaseName('personal'))
    selectWorkspace(company.id)
    expect(getActiveWorkspaceId()).toBe(company.id)
  })

  it('stores Company records outside the existing Personal database', async () => {
    const company = createCompanyWorkspace('Isolated Co', '', '')
    selectWorkspace(company.id)
    const companyDb = new WorkspaceDatabase()
    await companyDb.open()
    await companyDb.tasks.add({ id: 'company-only', user_id: 'local', title: 'Company record', description: null, due_date: null, priority: 'medium', completed: false, status: 'todo', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' })
    await db.open()
    expect(await companyDb.tasks.count()).toBe(1)
    expect(await db.tasks.where('id').equals('company-only').count()).toBe(0)
    companyDb.close()
    await companyDb.delete()
  })

  it('calculates inclusive workday totals and calendar tenure', () => {
    expect(getEmploymentTenure('2026-10-20', null, '2026-11-17')).toEqual({ years: 0, months: 0, days: 28, totalDays: 29 })
    expect(getEmploymentTenure('2024-01-01', null, '2026-01-01')).toMatchObject({ years: 2, months: 0 })
  })
})
