import { useCallback, useEffect, useMemo, useState } from 'react'

import * as api from '@/gateway/api'
import { useI18n } from '@/i18n'
import type { EnvVarInfo, ToolsetInfo } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { cn } from '@/ui/utils'

import { providerGroup, toolsetDisplayLabel } from '../helpers'
import { KeyRoundIcon } from '../icons'
import { Caption, ErrorNote, Row, SectionHeading, Toggle } from '../ui'

type KeysView = 'settings' | 'tools'

export function KeysPage() {
  const { t } = useI18n()
  const [view, setView] = useState<KeysView>('tools')

  return (
    <div>
      <SectionHeading icon={KeyRoundIcon} title={t.settings.nav.apiKeys} />
      <div className="mb-3 flex gap-1 rounded-lg bg-(--ui-bg-quaternary) p-0.5">
        {(
          [
            ['tools', t.settings.nav.keysTools],
            ['settings', t.settings.nav.keysSettings]
          ] as [KeysView, string][]
        ).map(([id, label]) => (
          <button
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-(--conversation-text-font-size) transition-colors',
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

      {view === 'tools' ? <ToolsView /> : <EnvKeysView />}
    </div>
  )
}

function ToolsView() {
  const { t } = useI18n()
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    void api
      .getToolsets()
      .then(setToolsets)
      .catch(err => setError(err instanceof Error ? err.message : t.settings.keys.loadFailed))
      .finally(() => setLoading(false))
  }, [t.settings.keys.loadFailed])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async (toolset: ToolsetInfo) => {
    setToolsets(prev => prev.map(row => (row.name === toolset.name ? { ...row, enabled: !row.enabled } : row)))

    try {
      await api.setToolsetEnabled(toolset.name, !toolset.enabled)
    } catch {
      setToolsets(prev => prev.map(row => (row.name === toolset.name ? { ...row, enabled: toolset.enabled } : row)))
    }
  }

  if (loading) {
    return <Caption className="py-6 text-center">{t.common.loading}</Caption>
  }

  return (
    <div>
      <Caption className="mb-2">{t.settings.keys.toolsDesc}</Caption>
      <ErrorNote>{error}</ErrorNote>
      {toolsets.map(toolset => (
        <Row
          action={<Toggle checked={toolset.enabled} onChange={() => void toggle(toolset)} />}
          description={toolset.description}
          key={toolset.name}
          title={toolsetDisplayLabel(toolset)}
        />
      ))}
    </div>
  )
}

function EnvKeysView() {
  const { t } = useI18n()
  const k = t.settings.keys
  const [env, setEnv] = useState<Record<string, EnvVarInfo>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ key: string; info: EnvVarInfo } | null>(null)
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    void api
      .getEnvVars()
      .then(setEnv)
      .catch(err => setError(err instanceof Error ? err.message : k.loadFailed))
      .finally(() => setLoading(false))
  }, [k.loadFailed])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const entries = Object.entries(env)
      .filter(([, info]) => !info.channel_managed)
      .filter(([key, info]) => !normalized || `${key} ${info.description}`.toLowerCase().includes(normalized))

    const byGroup = new Map<string, [string, EnvVarInfo][]>()

    for (const entry of entries) {
      const group = entry[1].provider_label ?? providerGroup(entry[0])

      byGroup.set(group, [...(byGroup.get(group) ?? []), entry])
    }

    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [env, query])

  if (loading) {
    return <Caption className="py-6 text-center">{t.common.loading}</Caption>
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 rounded-[var(--btn-radius)] bg-(--ui-bg-quaternary) px-2.5 py-2">
        <Input
          className="border-0 bg-transparent p-0 shadow-none min-w-0 flex-1"
          onChange={event => setQuery(event.target.value)}
          placeholder={k.searchKeys}
          value={query}
        />
      </div>
      <ErrorNote>{error}</ErrorNote>
      {groups.length === 0 && <Caption className="py-6 text-center">{k.noMatches}</Caption>}

      {groups.map(([group, entries]) => (
        <div key={group}>
          <p className="pt-3 pb-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)">
            {group === 'Other' ? k.other : group}
          </p>
          {entries
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, info]) => (
              <Row
                action={
                  <span
                    className={cn(
                      'rounded-md px-2 py-1 text-(--conversation-caption-font-size)',
                      info.is_set ? 'bg-(--theme-primary)/10 text-(--theme-primary)' : 'bg-(--ui-bg-quaternary) text-(--ui-text-quaternary)'
                    )}
                  >
                    {info.is_set ? k.set : k.notSet}
                  </span>
                }
                description={info.description}
                key={key}
                onClick={() => {
                  setEditing({ key, info })
                  setDraft('')
                  setRevealed('')
                }}
                title={<span className="font-mono text-(--conversation-tool-font-size)">{key}</span>}
              />
            ))}
        </div>
      ))}

      {editing && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end md:justify-center md:items-center md:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(null)} />
          <div className="relative w-full md:w-auto md:min-w-[24rem] rounded-t-xl md:rounded-xl border border-(--stroke-nous) shadow-(--shadow-nous) bg-(--ui-bg-elevated) p-4 pb-[calc(1rem+var(--safe-area-bottom))] space-y-3">
            <div className="text-xs font-semibold text-(--ui-text-secondary) font-mono">{editing.key}</div>
            {(revealed || (editing.info.is_set && editing.info.redacted_value)) && (
              <Caption className="font-mono break-all">{revealed || editing.info.redacted_value}</Caption>
            )}
            <Input autoComplete="off" onChange={event => setDraft(event.target.value)} placeholder={k.setValue} type="password" value={draft} />
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
                    .catch(err => setError(err instanceof Error ? err.message : k.saveFailed(editing.key)))
                    .finally(() => setSaving(false))
                }}
              >
                {t.common.save}
              </Button>
              {editing.info.is_set && (
                <Button
                  className="flex-1"
                  disabled={saving}
                  onClick={() => void api.revealEnvVar(editing.key).then(result => setRevealed(result.value)).catch(() => {})}
                  variant="secondary"
                >
                  {k.reveal}
                </Button>
              )}
              {editing.info.is_set && (
                <Button
                  className="flex-1"
                  disabled={saving}
                  onClick={() => {
                    if (window.confirm(k.removeConfirm(editing.key))) {
                      setSaving(true)
                      void api
                        .deleteEnvVar(editing.key)
                        .then(() => {
                          setEditing(null)
                          load()
                        })
                        .catch(err => setError(err instanceof Error ? err.message : k.saveFailed(editing.key)))
                        .finally(() => setSaving(false))
                    }
                  }}
                  variant="destructive"
                >
                  {t.common.delete}
                </Button>
              )}
            </div>
            <Button className="w-full" onClick={() => setEditing(null)} variant="ghost">
              {t.common.close}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
