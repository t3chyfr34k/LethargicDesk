import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishNtfySettings } from './ntfy'

const config = { baseUrl: 'https://ntfy.example/', topic: 'private-work-topic', token: 'tk_example', priority: 'high' as const, tags: 'bell,calendar', clickUrl: 'https://desk.example/calendar' }

afterEach(() => vi.unstubAllGlobals())

describe('ntfy publishing', () => {
  it('publishes to the configured server and topic with auth and display options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await publishNtfySettings(config, 'Calendar reminder', 'Open the app to view your event.')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://ntfy.example/private-work-topic')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tk_example')
    expect((init.headers as Record<string, string>).Priority).toBe('high')
    expect((init.headers as Record<string, string>).Tags).toBe('bell,calendar')
    expect((init.headers as Record<string, string>).Click).toBe('https://desk.example/calendar')
  })

  it('rejects a topic that could escape the configured topic path', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(publishNtfySettings({ ...config, topic: 'private/topic' }, 'Test', 'Test')).rejects.toThrow('one path name')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces provider errors without exposing credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    await expect(publishNtfySettings(config, 'Test', 'Test')).rejects.toThrow('HTTP 401')
  })
})
