import { useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, Check, KeyRound, LoaderCircle, Send, Settings2, Trash2 } from 'lucide-react'
import { requestAI } from '../lib/ai-providers'
import type { AIConnection, AIMessage, AIProvider } from '../lib/ai-providers'

const providers: { id: AIProvider; name: string; modelHint: string; keyUrl: string }[] = [
  { id: 'openai', name: 'OpenAI', modelHint: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'groq', name: 'Groq', modelHint: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  { id: 'gemini', name: 'Google Gemini', modelHint: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'openrouter', name: 'OpenRouter', modelHint: 'provider/model-name', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'compatible', name: 'Other OpenAI-compatible API', modelHint: 'model ID from your provider', keyUrl: '' },
]
type SavedSettings = { provider: AIProvider; model: string; baseUrl: string; rememberKey: boolean }
const safeStorage = (storage: Storage, action: (value: Storage) => void) => { try { action(storage) } catch { /* Browser storage may be disabled. */ } }
const configKey = (scope: string) => `lethargic-desk:ai-config:v1:${scope}`
const keyKey = (scope: string, provider: AIProvider) => `lethargic-desk:ai-key:v1:${scope}:${provider}`
function readConfig(scope: string): SavedSettings {
  try {
    const value = JSON.parse(localStorage.getItem(configKey(scope)) ?? 'null') as Partial<SavedSettings> | null
    if (value && providers.some(item => item.id === value.provider)) return { provider: value.provider!, model: value.model ?? '', baseUrl: value.baseUrl ?? '', rememberKey: value.rememberKey ?? false }
  } catch { /* Use initial settings. */ }
  return { provider: 'openai', model: '', baseUrl: '', rememberKey: false }
}

export function AIAssistant({ scope }: { scope: string }) {
  const [initial] = useState(() => readConfig(scope))
  const [provider, setProvider] = useState<AIProvider>(initial.provider)
  const [model, setModel] = useState(initial.model)
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [apiKey, setApiKey] = useState(() => {
    try { return (initial.rememberKey ? localStorage : sessionStorage).getItem(keyKey(scope, initial.provider)) ?? '' } catch { return '' }
  })
  const [rememberKey, setRememberKey] = useState(initial.rememberKey)
  const [showSettings, setShowSettings] = useState(true)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<AIMessage[]>([])
  const currentProvider = providers.find(item => item.id === provider)!

  const selectProvider = (next: AIProvider) => {
    setProvider(next)
    setModel('')
    setApiKey(() => {
      try { return sessionStorage.getItem(keyKey(scope, next)) ?? localStorage.getItem(keyKey(scope, next)) ?? '' } catch { return '' }
    })
    try { setRememberKey(Boolean(localStorage.getItem(keyKey(scope, next)))) } catch { setRememberKey(false) }
    setStatus('')
  }
  const connection = (): AIConnection => ({ provider, apiKey, model, ...(provider === 'compatible' ? { baseUrl } : {}) })
  const saveSettings = (event: FormEvent) => {
    event.preventDefault()
    const setting: SavedSettings = { provider, model: model.trim(), baseUrl: baseUrl.trim(), rememberKey }
    safeStorage(localStorage, storage => storage.setItem(configKey(scope), JSON.stringify(setting)))
    const storageKey = keyKey(scope, provider)
    safeStorage(sessionStorage, storage => storage.removeItem(storageKey))
    safeStorage(localStorage, storage => storage.removeItem(storageKey))
    if (apiKey.trim()) safeStorage(rememberKey ? localStorage : sessionStorage, storage => storage.setItem(storageKey, apiKey.trim()))
    setStatus(rememberKey ? 'Settings and key saved on this device.' : 'Settings saved. The key will be cleared when this browser tab session ends.')
  }
  const testConnection = async () => {
    setBusy(true); setStatus('Checking provider connection…')
    try {
      await requestAI(connection(), [{ role: 'user', content: 'Reply with only OK.' }])
      setStatus(`Connected to ${currentProvider.name}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not connect to this provider.')
    } finally { setBusy(false) }
  }
  const send = async (event: FormEvent) => {
    event.preventDefault()
    const text = prompt.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next); setPrompt(''); setStatus(''); setBusy(true)
    try {
      const answer = await requestAI(connection(), next)
      setMessages([...next, { role: 'assistant', content: answer }])
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The provider request failed.')
    } finally { setBusy(false) }
  }
  const forgetKey = () => {
    const storageKey = keyKey(scope, provider)
    safeStorage(sessionStorage, storage => storage.removeItem(storageKey))
    safeStorage(localStorage, storage => storage.removeItem(storageKey))
    setApiKey(''); setStatus('Saved API key removed from this device.')
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">LETHARGIC DESK / YOUR AI PROVIDER</div><h1>AI Assistant</h1><p>Connect an API key you control and chat with your chosen model.</p></div><button className="today-button ai-settings-toggle" type="button" onClick={() => setShowSettings(value => !value)}><Settings2 size={15}/>{showSettings ? 'Hide setup' : 'Provider setup'}</button></div>
    {showSettings && <section className="panel ai-setup"><div className="panel-header"><div><h2><KeyRound size={16}/> Connect a provider</h2><p>Choose a provider, enter its API key and a model ID from your provider console.</p></div></div>
      <form className="ai-settings-form" onSubmit={saveSettings}>
        <label>Provider<select value={provider} onChange={event => selectProvider(event.target.value as AIProvider)}>{providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {provider === 'compatible' && <label>API base URL<input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://your-provider.example/v1" required/></label>}
        <label>Model ID<input value={model} onChange={event => setModel(event.target.value)} placeholder={currentProvider.modelHint} required/></label>
        <label>API key<input type="password" autoComplete="new-password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Paste your provider API key" required/></label>
        <label className="ai-remember"><input type="checkbox" checked={rememberKey} onChange={event => setRememberKey(event.target.checked)}/> Remember this key on this device</label>
        <div className="ai-setup-actions"><button className="primary-button" type="submit">Save provider</button><button className="today-button" type="button" onClick={() => void testConnection()} disabled={busy||!apiKey||!model}>{busy ? <LoaderCircle size={14}/> : <Check size={14}/>}Test connection</button>{apiKey&&<button className="text-button" type="button" onClick={forgetKey}><Trash2 size={14}/>Forget key</button>}</div>
      </form>
      <p className="ai-privacy"><b>Key and privacy:</b> API keys are stored only in this browser, scoped to your account and workspace. They are not uploaded to Lethargic Desk or synced to Supabase. Browser storage can be accessed by scripts running in this app, so use provider key restrictions and spending limits. Requests and chat messages go directly to {currentProvider.name}; that provider’s terms, privacy policy, and usage charges apply. Avoid sharing sensitive information.</p>
      {currentProvider.keyUrl&&<a className="ai-key-link" href={currentProvider.keyUrl} target="_blank" rel="noreferrer">Get a {currentProvider.name} API key ↗</a>}
    </section>}
    <section className="panel ai-chat"><div className="panel-header"><div><h2><Bot size={17}/> Chat</h2><p>{apiKey&&model?`${currentProvider.name} · ${model}`:'Connect a provider to start chatting.'}</p></div>{messages.length>0&&<button className="text-button" type="button" onClick={() => { setMessages([]); setStatus('Conversation cleared.') }}>Clear chat</button>}</div>
      <div className="ai-messages" aria-live="polite">{messages.length===0?<div className="ai-empty"><Bot size={23}/><b>Your assistant, your provider.</b><span>Connect an API above, then ask a question.</span></div>:messages.map((message,index)=><article className={`ai-message ai-${message.role}`} key={index}><b>{message.role==='user'?'You':'Assistant'}</b><p>{message.content}</p></article>)}{busy&&<div className="ai-thinking"><LoaderCircle size={14}/> {messages.length===0?'Testing provider…':'Thinking…'}</div>}</div>
      <form className="ai-prompt-form" onSubmit={send}><textarea aria-label="Message the AI assistant" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ask your assistant…" rows={2} disabled={!apiKey||!model||busy}/><button className="primary-button" type="submit" disabled={!apiKey||!model||!prompt.trim()||busy}><Send size={15}/>Send</button></form>
      {status&&<p className="form-message ai-status" role="status">{status}</p>}
    </section>
  </>
}
