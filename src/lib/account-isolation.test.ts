import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, repositories, setDatabaseAccountScope } from './database'

beforeEach(async () => {
  localStorage.clear()
  await setDatabaseAccountScope(null)
  await db.delete()
  await db.open()
})

afterAll(async () => {
  db.close()
  await db.delete()
})

describe('account-scoped local data', () => {
  it('switches Personal data to a separate IndexedDB database for every account', async () => {
    await setDatabaseAccountScope('user-a')
    await repositories.tasks.save({
      id: 'private-a', user_id: 'local', title: 'Account A task', description: null, due_date: null,
      priority: 'medium', completed: false, status: 'todo', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    })

    await setDatabaseAccountScope('user-b')
    expect(await repositories.tasks.all()).toEqual([])
    await repositories.tasks.save({
      id: 'private-b', user_id: 'local', title: 'Account B task', description: null, due_date: null,
      priority: 'medium', completed: false, status: 'todo', created_at: '2026-01-02T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    })

    await setDatabaseAccountScope('user-a')
    expect(await repositories.tasks.all()).toMatchObject([{ id: 'private-a', title: 'Account A task' }])
    await setDatabaseAccountScope('user-b')
    expect(await repositories.tasks.all()).toMatchObject([{ id: 'private-b', title: 'Account B task' }])
  })
})
