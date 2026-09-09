import { useCallback, useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import { useI18n } from '@/i18n'
import type { WebhookRoute, WebhooksResponse } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { Switch } from '@/ui/Switch'

interface WebhooksPageProps {
  onClose: () => void
  open: boolean
}

const DELIVERY_OPTIONS = ['log', 'telegram', 'discord', 'slack', 'email', 'github_comment'] as const

/** Gateway-owned webhook subscriptions. Secrets are deliberately shown only
 * from the create response and are never retained by this client. */
export function WebhooksPage({ onClose, open }: WebhooksPageProps) {
  const { t } = useI18n()
  const w = t.webhooks

  const [data, setData] = useState<WebhooksResponse | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [events, setEvents] = useState('')
  const [prompt, setPrompt] = useState('')
  const [skills, setSkills] = useState('')
  const [deliver, setDeliver] = useState('log')
  const [deliverOnly, setDeliverOnly] = useState(false)
  const [createdSecret, setCreatedSecret] = useState<{ secret: string; url: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api.getWebhooks())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : w.errors.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [w.errors.loadFailed])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const enable = async () => {
    setWorking(true)
    setError('')
    try {
      const result = await api.enableWebhooks()
      if (result.needs_restart) {
        setError(w.receiverRestartNotice)
      }
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : w.errors.enableFailed)
    } finally {
      setWorking(false)
    }
  }

  const create = async () => {
    const nextName = name.trim()
    if (!nextName || working) return
    setWorking(true)
    setError('')
    try {
      const split = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean)
      const result = await api.createWebhook({
        name: nextName,
        deliver,
        deliver_only: deliverOnly,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        ...(split(events).length ? { events: split(events) } : {}),
        ...(split(skills).length ? { skills: split(skills) } : {})
      })
      setCreatedSecret({ secret: result.secret, url: result.url })
      setName('')
      setDescription('')
      setEvents('')
      setPrompt('')
      setSkills('')
      setDeliverOnly(false)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : w.errors.createFailed)
    } finally {
      setWorking(false)
    }
  }

  const toggle = async (route: WebhookRoute) => {
    setWorking(true)
    setError('')
    try {
      await api.setWebhookEnabled(route.name, !route.enabled)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : w.errors.updateFailed)
    } finally {
      setWorking(false)
    }
  }

  const remove = async (route: WebhookRoute) => {
    if (working || !window.confirm(w.deleteConfirm(route.name))) return
    setWorking(true)
    setError('')
    try {
      await api.deleteWebhook(route.name)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : w.errors.deleteFailed)
    } finally {
      setWorking(false)
    }
  }

  return (
    <ResponsiveSheet onClose={onClose} open={open} title={w.title}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-(--ui-text-tertiary)">{w.description}</p>
        {!data?.enabled ? <Button disabled={working} onClick={() => void enable()} size="sm">{w.enableReceiver}</Button> : null}
        {error ? <div className="rounded-md bg-(--ui-red)/10 px-2.5 py-2 text-xs text-(--ui-red)">{error}</div> : null}
        {createdSecret ? (
          <div className="space-y-1 rounded-md border border-(--ui-accent)/30 bg-(--ui-accent)/5 p-2.5 text-xs">
            <div className="font-medium text-(--ui-text-primary)">{w.secretNotice}</div>
            <code className="block break-all text-(--ui-text-secondary)">{createdSecret.secret}</code>
            <code className="block break-all text-(--ui-text-tertiary)">{createdSecret.url}</code>
            <button className="text-(--ui-accent)" onClick={() => setCreatedSecret(null)} type="button">{w.done}</button>
          </div>
        ) : null}
        <section className="space-y-2 rounded-lg border border-(--ui-stroke-tertiary) p-3">
          <div className="text-xs font-medium text-(--ui-text-primary)">{w.newSubscription}</div>
          <input className="webhook-input" disabled={working} onChange={event => setName(event.target.value)} placeholder={w.namePlaceholder} value={name} />
          <input className="webhook-input" disabled={working} onChange={event => setDescription(event.target.value)} placeholder={w.descriptionPlaceholder} value={description} />
          <input className="webhook-input" disabled={working} onChange={event => setEvents(event.target.value)} placeholder={w.eventsPlaceholder} value={events} />
          <input className="webhook-input" disabled={working} onChange={event => setSkills(event.target.value)} placeholder={w.skillsPlaceholder} value={skills} />
          <textarea className="webhook-input min-h-16 resize-y" disabled={working} onChange={event => setPrompt(event.target.value)} placeholder={w.promptPlaceholder} value={prompt} />
          <div className="flex items-center gap-2">
            <select className="webhook-input flex-1" disabled={working} onChange={event => setDeliver(event.target.value)} value={deliver}>
              {DELIVERY_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {w.deliveryLabels[option] ?? option}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary) cursor-pointer select-none">
              <Switch
                checked={deliverOnly}
                disabled={working}
                onChange={setDeliverOnly}
                size="sm"
              />
              <span>{w.deliverOnly}</span>
            </label>
          </div>
          <Button disabled={!name.trim() || working || !data?.enabled} onClick={() => void create()} size="sm">{w.createWebhook}</Button>
        </section>
        <section className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">
          <div className="flex items-center justify-between border-b border-(--ui-stroke-tertiary) px-3 py-2"><span className="text-xs font-medium">{w.subscriptions}</span><button className="text-xs text-(--ui-accent)" onClick={() => void refresh()} type="button">{w.refresh}</button></div>
          {loading ? <div className="px-3 py-5 text-center text-xs text-(--ui-text-quaternary)">{w.loading}</div> : null}
          {!loading && data?.subscriptions.map(route => (
            <div className="border-b border-(--ui-stroke-tertiary) px-3 py-2.5 last:border-b-0" key={route.name}>
              <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs font-medium text-(--ui-text-primary)">{route.name}</span><button className="text-[0.68rem] text-(--ui-accent) disabled:opacity-40" disabled={working} onClick={() => void toggle(route)} type="button">{route.enabled ? w.disable : w.enable}</button><button className="text-[0.68rem] text-(--ui-red) disabled:opacity-40" disabled={working} onClick={() => void remove(route)} type="button">{w.delete}</button></div>
              <div className="mt-1 truncate text-[0.68rem] text-(--ui-text-quaternary)">{route.description || route.url}</div>
              <div className="mt-1 text-[0.65rem] text-(--ui-text-quaternary)">{w.deliveryLabels[route.deliver as keyof typeof w.deliveryLabels] ?? route.deliver} · {route.events.length ? route.events.join(', ') : w.allEvents}</div>
            </div>
          ))}
          {!loading && data?.enabled && !data.subscriptions.length ? <div className="px-3 py-5 text-center text-xs text-(--ui-text-quaternary)">{w.noSubscriptions}</div> : null}
        </section>
      </div>
    </ResponsiveSheet>
  )
}
