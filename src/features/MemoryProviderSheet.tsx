import { useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { MemoryProviderConfig, MemoryProviderOAuthStatus } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { openExternalUrl } from '@/native'

interface MemoryProviderSheetProps { name: string; onClose: () => void; open: boolean }

/** Provider settings are declared by the connected Gateway so the same form
 * works for browser, mobile and desktop without embedding provider secrets. */
export function MemoryProviderSheet({ name, onClose, open }: MemoryProviderSheetProps) {
  const [config, setConfig] = useState<MemoryProviderConfig | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [oauth, setOauth] = useState<MemoryProviderOAuthStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true); setNotice('')
    try {
      const [nextConfig, nextOauth] = await Promise.all([api.getMemoryProviderConfig(name), api.getMemoryProviderOAuthStatus(name).catch(() => null)])
      setConfig(nextConfig)
      setValues(Object.fromEntries(nextConfig.fields.map(field => [field.key, field.value || ''])))
      setOauth(nextOauth)
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to load provider settings') } finally { setLoading(false) }
  }
  useEffect(() => { if (open) void load() }, [open, name])

  useEffect(() => {
    if (oauth?.state !== 'pending') return
    const timer = window.setInterval(() => {
      void api.getMemoryProviderOAuthStatus(name).then(status => {
        setOauth(status)
        if (status.state !== 'pending') setNotice(status.detail || (status.connected ? 'Connected.' : 'Authorization did not complete.'))
      }).catch(() => undefined)
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [oauth?.state, name])

  const save = async () => {
    setSaving(true); setNotice('')
    try { await api.saveMemoryProviderConfig(name, values); setNotice('Saved on the connected Gateway.'); await load() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to save provider settings') } finally { setSaving(false) }
  }
  const connect = async () => {
    setSaving(true); setNotice('')
    try { const status = await api.startMemoryProviderOAuth(name); setOauth(status); setNotice(status.detail || 'Authorization started on the connected Gateway.') } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to start provider authorization') } finally { setSaving(false) }
  }

  return <ResponsiveSheet onClose={onClose} open={open} title={config?.label || `${name} memory`}><div className="space-y-4">{loading && !config ? <div className="py-6 text-center text-xs text-(--ui-text-quaternary)">Loading provider settings…</div> : null}{config ? <><p className="text-xs text-(--ui-text-tertiary)">Settings and credentials are stored by the connected Gateway.</p>{config.fields.map(field => <label className="block" key={field.key}><span className="mb-1 block text-xs text-(--ui-text-secondary)">{field.label}</span>{field.kind === 'select' ? <select className="webhook-input" onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} value={values[field.key] ?? ''}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.kind === 'bool' ? <input checked={(values[field.key] ?? '') === 'true'} onChange={event => setValues(current => ({ ...current, [field.key]: String(event.target.checked) }))} type="checkbox" /> : <input className="webhook-input" onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} type={field.kind === 'secret' ? 'password' : 'text'} value={values[field.key] ?? ''} />}{field.description ? <span className="mt-1 block text-[0.68rem] text-(--ui-text-quaternary)">{field.description}</span> : null}</label>)}<div className="flex gap-2"><Button disabled={saving} onClick={() => void save()} size="sm">{saving ? 'Saving…' : 'Save settings'}</Button>{oauth?.auth === 'oauth' ? <Button disabled={saving || oauth.state === 'pending'} onClick={() => void connect()} size="sm" variant="secondary">{oauth.connected ? 'Reconnect OAuth' : oauth.state === 'pending' ? 'Waiting for OAuth…' : 'Connect OAuth'}</Button> : null}{config.docs_url ? <Button onClick={() => void openExternalUrl(config.docs_url)} size="sm" variant="secondary">Docs</Button> : null}</div>{oauth ? <div className="rounded-md bg-(--ui-bg-quaternary) px-2.5 py-2 text-xs text-(--ui-text-secondary)">OAuth: {oauth.state} · {oauth.detail}</div> : null}</> : null}{notice ? <div className="rounded-md bg-(--ui-bg-quaternary) px-2.5 py-2 text-xs text-(--ui-text-secondary)">{notice}</div> : null}</div></ResponsiveSheet>
}
