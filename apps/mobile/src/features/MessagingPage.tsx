import { useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { MessagingPlatformInfo, PairingResponse } from '@/types/hermes'
import { BottomSheet } from '@/ui/BottomSheet'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface MessagingPageProps {
  open: boolean
  onClose: () => void
}

export function MessagingPage({ open, onClose }: MessagingPageProps) {
  const { t } = useI18n()
  const [platforms, setPlatforms] = useState<MessagingPlatformInfo[]>([])
  const [pairing, setPairing] = useState<PairingResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)

    const [platformsResult, pairingResult] = await Promise.allSettled([
      api.getMessagingPlatforms(),
      api.getPairing()
    ])

    if (platformsResult.status === 'fulfilled') {
      setPlatforms(platformsResult.value.platforms)
    } else {
      setError(t.messaging.loadFailed)
    }

    if (pairingResult.status === 'fulfilled') {
      setPairing(pairingResult.value)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (open) {
      void refresh()
    }
  }, [open])

  const approveUser = async (platform: string, requestId: string) => {
    await api.approvePairing(platform, requestId)
    setPairing(previous => previous
      ? {
          pending: previous.pending.filter(user => user.request_id !== requestId),
          approved: [...previous.approved, ...(previous.pending.filter(user => user.request_id === requestId))]
        }
      : previous
    )
  }

  const revokeUser = async (platform: string, userId: string) => {
    await api.revokePairing(platform, userId)
    setPairing(previous => previous
      ? { ...previous, approved: previous.approved.filter(user => user.user_id !== userId || user.platform !== platform) }
      : previous
    )
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t.messaging.title} fullScreen>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-tertiary)">
          {t.messaging.subtitle}
        </p>
        <button className="shrink-0 text-(--conversation-tool-font-size) text-(--ui-accent)" onClick={() => void refresh()}>
          {t.common.refresh}
        </button>
      </div>

      {error && <p className="mb-3 rounded-md bg-(--theme-secondary,#1a5cff14) px-3 py-2 text-(--conversation-tool-font-size) text-(--ui-red)">{error}</p>}
      {loading && <p className="py-4 text-(--conversation-caption-font-size) text-(--ui-text-quaternary)">{t.common.loading}</p>}

      {!loading && platforms.length === 0 && !error && (
        <p className="py-4 text-(--conversation-caption-font-size) text-(--ui-text-quaternary)">{t.messaging.none}</p>
      )}

      <div className="space-y-2">
        {platforms.map(platform => <PlatformCard key={platform.id} platform={platform} onSaved={refresh} />)}
      </div>

      {pairing && pairing.pending.length > 0 && (
        <section className="mt-5">
          <SectionLabel label={t.messaging.pendingApprovals(pairing.pending.length)} />
          {pairing.pending.map(user => (
            <PairingRow
              key={`${user.platform}:${user.request_id}`}
              user={user}
              action={t.messaging.approve}
              onAction={() => user.request_id && void approveUser(user.platform, user.request_id)}
            />
          ))}
        </section>
      )}

      {pairing && pairing.approved.length > 0 && (
        <section className="mt-4">
          <SectionLabel label={t.messaging.approvedUsers(pairing.approved.length)} />
          {pairing.approved.map(user => (
            <PairingRow
              key={`${user.platform}:${user.user_id}`}
              user={user}
              action={t.messaging.revoke}
              destructive
              onAction={() => void revokeUser(user.platform, user.user_id)}
            />
          ))}
        </section>
      )}
    </BottomSheet>
  )
}

function PlatformCard({ platform, onSaved }: { platform: MessagingPlatformInfo; onSaved: () => Promise<void> }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const state = platform.enabled ? platform.state ?? 'starting' : 'disabled'

  const save = async (patch: { enabled?: boolean; env?: Record<string, string> }) => {
    setSaving(true)
    setNotice(null)
    try {
      await api.updateMessagingPlatform(platform.id, patch)
      setNotice(t.messaging.savedRestart)
      await onSaved()
    } catch {
      setNotice(t.messaging.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setNotice(null)
    try {
      const result = await api.testMessagingPlatform(platform.id)
      setNotice(result.message || (result.ok ? t.messaging.checkPassed : t.messaging.checkFailed))
      await onSaved()
    } catch {
      setNotice(t.messaging.checkFailed)
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-[var(--btn-radius)] border border-(--ui-stroke-tertiary) bg-(--ui-widget-surface-background)">
      <div className="flex items-start gap-3 px-3 py-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(value => !value)}>
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', state === 'connected' ? 'bg-(--ui-green)' : platform.enabled ? 'bg-(--ui-yellow)' : 'bg-(--ui-text-quaternary)')} />
            <span className="truncate text-(--conversation-text-font-size) font-medium text-(--ui-text-primary)">{platform.name}</span>
            <span className="rounded px-1.5 py-0.5 text-[0.6rem] capitalize text-(--ui-text-tertiary) bg-(--ui-bg-quaternary)">{state.replaceAll('_', ' ')}</span>
          </div>
          {platform.description && <p className="mt-1 pl-4 text-(--conversation-tool-font-size) text-(--ui-text-tertiary)">{platform.description}</p>}
        </button>
        <button
          aria-label={platform.enabled ? t.messaging.disable(platform.name) : t.messaging.enable(platform.name)}
          className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors', platform.enabled ? 'bg-(--theme-primary)' : 'bg-(--ui-bg-quaternary)')}
          disabled={saving}
          onClick={() => void save({ enabled: !platform.enabled })}
        >
          <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform', platform.enabled ? 'translate-x-[18px]' : 'translate-x-0.5')} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-(--ui-stroke-tertiary) px-3 py-3">
          {platform.error_message && <p className="mb-3 text-(--conversation-tool-font-size) text-(--ui-red)">{platform.error_message}</p>}
          {platform.home_channel && <p className="mb-3 text-(--conversation-tool-font-size) text-(--ui-text-tertiary)">{t.messaging.homeChannel(platform.home_channel.name)}</p>}
          {(platform.env_vars ?? []).map(field => (
            <label key={field.key} className="mb-3 block">
              <span className="mb-1 block text-(--conversation-tool-font-size) text-(--ui-text-secondary)">
                {field.prompt || field.key}{field.required ? ' *' : ''}
              </span>
              <input
                value={values[field.key] ?? ''}
                type={field.is_password ? 'password' : 'text'}
                placeholder={field.is_set ? field.redacted_value ?? t.messaging.configured : field.description || field.key}
                onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
                className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-(--conversation-tool-font-size) text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent)"
              />
              {field.description && <span className="mt-1 block text-[0.65rem] text-(--ui-text-quaternary)">{field.description}</span>}
            </label>
          ))}
          <div className="flex items-center gap-2">
            <button className="rounded-md bg-(--ui-accent) px-3 py-1.5 text-(--conversation-tool-font-size) text-white disabled:opacity-50" disabled={saving} onClick={() => void save({ env: Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim())) })}>
              {saving ? t.common.saving : t.common.save}
            </button>
            <button className="rounded-md bg-(--ui-bg-quaternary) px-3 py-1.5 text-(--conversation-tool-font-size) text-(--ui-text-secondary) disabled:opacity-50" disabled={testing} onClick={() => void test()}>
              {testing ? t.messaging.testing : t.messaging.test}
            </button>
            {platform.docs_url && <a className="ml-auto text-(--conversation-tool-font-size) text-(--ui-accent)" href={platform.docs_url} target="_blank" rel="noreferrer">{t.messaging.docs}</a>}
          </div>
          {notice && <p className="mt-2 text-(--conversation-tool-font-size) text-(--ui-text-tertiary)">{notice}</p>}
        </div>
      )}
    </section>
  )
}

function PairingRow({ user, action, destructive, onAction }: { user: { platform: string; user_id: string; user_name?: string }; action: string; destructive?: boolean; onAction: () => void }) {
  return <div className="flex items-center justify-between py-2.5 min-h-[2.75rem]"><div className="min-w-0 pr-3"><p className="truncate text-(--conversation-text-font-size) text-(--ui-text-primary)">{user.user_name ?? user.user_id}</p><p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary)">{user.platform}</p></div><button className={cn('shrink-0 rounded-md px-3 py-1.5 text-(--conversation-tool-font-size)', destructive ? 'text-(--ui-red)' : 'bg-(--ui-green) text-white')} onClick={onAction}>{action}</button></div>
}

function SectionLabel({ label }: { label: string }) {
  return <div className="flex items-center gap-2 pb-1 pt-2"><span className="shrink-0 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)">{label}</span><span aria-hidden="true" className="h-px flex-1 bg-(--ui-stroke-tertiary)" /></div>
}
