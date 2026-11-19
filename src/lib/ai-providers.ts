export type AIProvider = 'openai' | 'groq' | 'gemini' | 'openrouter' | 'compatible'
export type AIMessage = { role: 'user' | 'assistant'; content: string }
export type AIConnection = { provider: AIProvider; apiKey: string; model: string; baseUrl?: string }

const endpoints: Record<Exclude<AIProvider, 'gemini' | 'compatible'>, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

export async function requestAI(connection: AIConnection, messages: AIMessage[], signal?: AbortSignal): Promise<string> {
  const { provider, apiKey, model } = connection
  if (!apiKey.trim()) throw new Error('Enter an API key for this provider.')
  if (!model.trim()) throw new Error('Enter a model ID supported by your provider.')
  let response: Response

  if (provider === 'gemini') {
    const modelPath = model.trim().replace(/^models\//, '')
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelPath)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() }, signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'You are Lethargic Desk AI, a helpful assistant. Be clear, accurate, and concise.' }] },
        contents: messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
      }),
    })
  } else {
    const root = provider === 'compatible'
      ? connection.baseUrl?.trim().replace(/\/+$/, '')
      : endpoints[provider]
    if (!root) throw new Error('Enter an OpenAI-compatible API base URL.')
    const url = /\/chat\/completions$/i.test(root) ? root : `${root}/chat/completions`
    response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` }, signal,
      body: JSON.stringify({ model: model.trim(), messages: [
        { role: 'system', content: 'You are Lethargic Desk AI, a helpful assistant. Be clear, accurate, and concise.' },
        ...messages,
      ] }),
    })
  }

  const result = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const error = result?.error as { message?: unknown } | string | undefined
    const detail = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : `Provider returned HTTP ${response.status}.`
    throw new Error(detail)
  }
  if (provider === 'gemini') {
    const candidates = result?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
    const text = candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('').trim()
    if (text) return text
  } else {
    const choices = result?.choices as Array<{ message?: { content?: unknown } }> | undefined
    const content = choices?.[0]?.message?.content
    if (typeof content === 'string' && content.trim()) return content.trim()
    if (Array.isArray(content)) {
      const text = content.map(part => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '').join('').trim()
      if (text) return text
    }
  }
  throw new Error('The provider returned no text. Check the model and provider settings.')
}

export function providerBaseUrl(provider: AIProvider): string {
  if (provider === 'compatible') return ''
  if (provider === 'gemini') return 'https://generativelanguage.googleapis.com'
  return endpoints[provider]
}
