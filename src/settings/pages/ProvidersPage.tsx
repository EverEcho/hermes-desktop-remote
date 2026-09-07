import { useCallback, useEffect, useRef, useState } from 'react'

import * as api from '@/gateway/api'
import { useI18n } from '@/i18n'
import type { CustomEndpoint, CustomEndpointsResponse, EnvVarInfo, OAuthProvider } from '@/types/hermes'
import { Button, Spinner } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { cn } from '@/ui/utils'

import { providerGroup } from '../helpers'
import { ZapIcon } from '../icons'
import { Caption, ErrorNote, Row, SectionHeading, Toggle } from '../ui'

type ProvidersView = 'accounts' | 'endpoints' | 'keys'

export function ProvidersPage() {
  const { t } = useI18n()
  const [view, setView] = useState<ProvidersView>('accounts')

  return (
    <div>
      <SectionHeading icon={ZapIcon} title={t.settings.nav.providers} />
      <div className="mb-3 flex gap-1 rounded-lg bg-(--ui-bg-quaternary) p-0.5">
        {(
          [
            ['accounts', t.settings.nav.providerAccounts],
            ['keys', t.settings.nav.providerApiKeys],
            ['endpoints', t.settings.nav.providerCustomEndpoints]
          ] as [ProvidersView, string][]
        ).map(([id, label]) => (
          <button
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-(--conversation-text-font-size) transition-colors truncate',
              view === id ? 'bg-(--ui-bg-card) text-(--ui-text-primary) font-medium shadow-xs' : 'text-(--ui-text-tertiary)'
            )}
            key={id}
            onClick={() => setView(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'accounts' && <AccountsView />}
      {view === 'keys' && <ApiKeysView />}
      {view === 'endpoints' && <EndpointsView />}
    </div>
  )
}

function AccountsView() {
  const { t } = useI18n()
  const p = t.settings.providers
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ provider: OAuthProvider; userCode?: string; verificationUrl?: string } | null>(null)
  const pollTimer = useRef<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    void api
      .listOAuthProviders()
      .then(response => setProviders(response.providers))
      .catch(err => setError(err instanceof Error ? err.message : p.loadFailed))
      .finally(() => setLoading(false))
  }, [p.loadFailed])

  useEffect(() => {
    load()

    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current)
      }
    }
  }, [load])

  const startConnect = async (provider: OAuthProvider) => {
    setError('')

    try {
      const start = await api.startOAuthLogin(provider.id)

      if (start.flow === 'pkce') {
        window.open(start.auth_url, '_blank')
        setPending({ provider })
        beginPolling(provider, start.session_id, 2000)
      } else {
        window.open(start.verification_url, '_blank')
        setPending({ provider, userCode: start.user_code, verificationUrl: start.verification_url })
        beginPolling(provider, start.session_id, start.poll_interval * 1000 || 5000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : p.connectFailed)
    }
  }

  const beginPolling = (provider: OAuthProvider, sessionId: string, intervalMs: number) => {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current)
    }

    pollTimer.current = window.setInterval(async () => {
      try {
        const poll = await api.pollOAuth(provider.id, sessionId)

        if (poll.status === 'approved') {
          window.clearInterval(pollTimer.current!)
          pollTimer.current = null
          setPending(null)
          load()
        } else if (poll.status !== 'pending') {
          window.clearInterval(pollTimer.current!)
          pollTimer.current = null
          setPending(null)
          setError(poll.error_message || p.connectFailed)
        }
      } catch {
        // keep polling
      }
    }, intervalMs)
  }

  if (loading) {
    return <Caption className="py-6 text-center">{t.common.loading}</Caption>
  }

  return (
    <div>
      <Caption className="mb-2">{p.accountsIntro}</Caption>
      <ErrorNote>{error}</ErrorNote>
      {providers.map(provider => {
        const connected = provider.status === 'connected' || provider.connected === true

        return (
          <Row
            action={
              connected ? (
                <Button
                  onClick={() => {
                    if (window.confirm(p.disconnectConfirm(provider.name))) {
                      void api.disconnectOAuthProvider(provider.id).then(load)
                    }
                  }}
                  size="sm"
                  variant="text"
                >
                  {p.disconnect}
                </Button>
              ) : (
                <Button onClick={() => void startConnect(provider)} size="sm" variant="text">
                  {p.connect}
                </Button>
              )
            }
            description={connected ? p.connected : provider.docs_url}
            key={provider.id}
            title={provider.name}
          />
        )
      })}

      {pending && (
        <div className="mt-3 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) p-3 space-y-2">
          <Caption className="flex items-center gap-2">
            <Spinner className="size-3.5" />
            {p.waitingBrowser}
          </Caption>
          {pending.userCode && <Caption className="font-mono">{p.userCodeHint(pending.userCode)}</Caption>}
          {pending.verificationUrl && (
            <Button onClick={() => window.open(pending.verificationUrl, '_blank')} size="sm" variant="outline">
              {p.openSignIn}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function ApiKeysView() {
  const { t } = useI18n()
  const p = t.settings.providers
  const [env, setEnv] = useState<Record<string, EnvVarInfo>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ key: string; info: EnvVarInfo } | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    void api
      .getEnvVars()
      .then(setEnv)
      .catch(err => setError(err instanceof Error ? err.message : p.loadFailed))
      .finally(() => setLoading(false))
  }, [p.loadFailed])

  useEffect(() => {
    load()
  }, [load])

  const providerKeys = Object.entries(env)
    .filter(([key, info]) => !info.channel_managed && (info.provider || providerGroup(key) !== 'Other'))
    .filter(([key, info]) => {
      const normalized = query.trim().toLowerCase()

      if (!normalized) {
        return true
      }

      return `${key} ${info.provider_label ?? ''} ${providerGroup(key)}`.toLowerCase().includes(normalized)
    })
    .sort(([a], [b]) => a.localeCompare(b))

  if (loading) {
    return <Caption className="py-6 text-center">{t.common.loading}</Caption>
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 rounded-[var(--btn-radius)] bg-(--ui-bg-quaternary) px-2.5 py-2">
        <Input
          className="border-0 bg-transparent p-0 shadow-none min-w-0 flex-1"
          onChange={event => setQuery(event.target.value)}
          placeholder={p.searchKeys}
          value={query}
        />
      </div>
      <ErrorNote>{error}</ErrorNote>
      {providerKeys.length === 0 && <Caption className="py-6 text-center">{p.noKeys}</Caption>}
      {providerKeys.map(([key, info]) => (
        <Row
          action={
            <span
              className={cn(
                'rounded-md px-2 py-1 text-(--conversation-caption-font-size)',
                info.is_set ? 'bg-(--theme-primary)/10 text-(--theme-primary)' : 'bg-(--ui-bg-quaternary) text-(--ui-text-quaternary)'
              )}
            >
              {info.is_set ? p.set : p.notSet}
            </span>
          }
          description={info.provider_label ?? providerGroup(key)}
          key={key}
          onClick={() => {
            setEditing({ key, info })
            setDraft('')
          }}
          title={<span className="font-mono text-(--conversation-tool-font-size)">{key}</span>}
        />
      ))}

      {editing && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end md:justify-center md:items-center md:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(null)} />
          <div className="relative w-full md:w-auto md:min-w-[24rem] rounded-t-xl md:rounded-xl border border-(--stroke-nous) shadow-(--shadow-nous) bg-(--ui-bg-elevated) p-4 pb-[calc(1rem+var(--safe-area-bottom))] space-y-3">
            <div className="text-xs font-semibold text-(--ui-text-secondary) font-mono">{editing.key}</div>
            {editing.info.is_set && editing.info.redacted_value && (
              <Caption className="font-mono">{editing.info.redacted_value}</Caption>
            )}
            <Input
              autoComplete="off"
              onChange={event => setDraft(event.target.value)}
              placeholder={p.setKey}
              type="password"
              value={draft}
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!draft.trim() || saving}
                onClick={() => {
                  setSaving(true)
                  void api
                    .setEnvVar(editing.key, draft.trim())
                    .then(() => {
                      setEditing(null)
                      load()
                    })
                    .catch(err => setError(err instanceof Error ? err.message : p.saveFailed(editing.key)))
                    .finally(() => setSaving(false))
                }}
              >
                {t.common.save}
              </Button>
              {editing.info.is_set && (
                <Button
                  className="flex-1"
                  disabled={saving}
                  onClick={() => {
                    if (window.confirm(p.removeConfirm(editing.key))) {
                      setSaving(true)
                      void api
                        .deleteEnvVar(editing.key)
                        .then(() => {
                          setEditing(null)
                          load()
                        })
                        .catch(err => setError(err instanceof Error ? err.message : p.saveFailed(editing.key)))
                        .finally(() => setSaving(false))
                    }
                  }}
                  variant="destructive"
                >
                  {p.removeKey}
                </Button>
              )}
              <Button className="flex-1" onClick={() => setEditing(null)} variant="secondary">
                {t.common.close}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EndpointsView() {
  const { t } = useI18n()
  const p = t.settings.providers
  const [data, setData] = useState<CustomEndpointsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<null | { id?: string }>(null)
  const [form, setForm] = useState({ apiKey: '', baseUrl: '', discover: true, model: '', name: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    void api
      .getCustomEndpoints()
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : p.loadFailed))
      .finally(() => setLoading(false))
  }, [p.loadFailed])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setError('')

    try {
      await api.saveCustomEndpoint({
        ...(form.apiKey.trim() ? { api_key: form.apiKey.trim() } : {}),
        base_url: form.baseUrl.trim(),
        discover_models: form.discover,
        ...(editing?.id ? { id: editing.id } : {}),
        model: form.model.trim(),
        name: form.name.trim()
      })
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : p.endpointSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Caption className="py-6 text-center">{t.common.loading}</Caption>
  }

  const endpoints: CustomEndpoint[] = data?.endpoints ?? []

  return (
    <div>
      <SectionHeading title={p.endpointsTitle} />
      <Caption className="mb-2">{p.endpointsDesc}</Caption>
      <ErrorNote>{error}</ErrorNote>

      {endpoints.map(endpoint => (
        <Row
          action={
            <div className="flex shrink-0 items-center gap-1">
              {endpoint.is_current && (
                <span className="rounded-md bg-(--theme-primary)/10 px-2 py-1 text-(--conversation-caption-font-size) text-(--theme-primary)">
                  {p.active}
                </span>
              )}
              {!endpoint.is_current && (
                <Button onClick={() => void api.activateCustomEndpoint(endpoint.id).then(load)} size="sm" variant="text">
                  {p.activate}
                </Button>
              )}
              <Button
                onClick={() => {
                  if (window.confirm(p.deleteConfirm(endpoint.name))) {
                    void api.deleteCustomEndpoint(endpoint.id).then(load)
                  }
                }}
                size="sm"
                variant="text"
                className="text-(--ui-red)"
              >
                {p.delete}
              </Button>
            </div>
          }
          description={`${endpoint.base_url} · ${endpoint.model}`}
          key={endpoint.id}
          onClick={() => {
            setEditing({ id: endpoint.id })
            setForm({ apiKey: '', baseUrl: endpoint.base_url, discover: endpoint.discover_models, model: endpoint.model, name: endpoint.name })
          }}
          title={endpoint.name}
        />
      ))}

      <Button
        className="mt-2"
        onClick={() => {
          setEditing({})
          setForm({ apiKey: '', baseUrl: '', discover: true, model: '', name: '' })
        }}
        size="sm"
        variant="outline"
      >
        {p.addEndpoint}
      </Button>

      {editing && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end md:justify-center md:items-center md:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(null)} />
          <div className="relative w-full md:w-auto md:min-w-[24rem] rounded-t-xl md:rounded-xl border border-(--stroke-nous) shadow-(--shadow-nous) bg-(--ui-bg-elevated) p-4 pb-[calc(1rem+var(--safe-area-bottom))] space-y-3">
            <Input onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder={p.name} value={form.name} />
            <Input
              onChange={e => setForm(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://localhost:8080/v1"
              value={form.baseUrl}
            />
            <Input onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))} placeholder={p.model} value={form.model} />
            <Input autoComplete="off" onChange={e => setForm(prev => ({ ...prev, apiKey: e.target.value }))} placeholder={p.apiKey} type="password" value={form.apiKey} />
            <div className="flex items-center justify-between">
              <Caption>{p.discoverModels}</Caption>
              <Toggle checked={form.discover} onChange={on => setForm(prev => ({ ...prev, discover: on }))} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!form.name.trim() || !form.baseUrl.trim() || !form.model.trim() || saving} onClick={() => void save()}>
                {t.common.save}
              </Button>
              <Button className="flex-1" onClick={() => setEditing(null)} variant="secondary">
                {t.common.close}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
