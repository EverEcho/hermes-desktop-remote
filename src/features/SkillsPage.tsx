import { useEffect, useMemo, useState, type ReactNode } from 'react'

import * as api from '@/gateway/api'
import type { McpServerSummary, SkillInfo, ToolsetInfo } from '@/types/hermes'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { Switch } from '@/ui/Switch'
import { useI18n } from '@/i18n'
import { Button } from '@/ui/Button'
import { SkillHubPage } from './SkillHubPage'
import { McpServersPage } from './McpServersPage'
import { ToolsetConfigSheet } from './ToolsetConfigSheet'

interface SkillsPageProps {
  open: boolean
  onClose: () => void
}

export function SkillsPage({ open, onClose }: SkillsPageProps) {
  const { t } = useI18n()
  const s = t.skills
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([])
  const [mcpServers, setMcpServers] = useState<McpServerSummary[]>([])
  const [hubOpen, setHubOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [toolsetConfigName, setToolsetConfigName] = useState<string | null>(null)
  const [skillPreview, setSkillPreview] = useState<{ content: string; name: string; path: string } | null>(null)

  const refreshSkills = () => {
    api.getSkills().then(setSkills).catch(() => undefined)
  }
  const visibleSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    return !normalized ? skills : skills.filter(skill =>
      `${skill.name} ${skill.description ?? ''} ${skill.source ?? ''}`.toLowerCase().includes(normalized)
    )
  }, [query, skills])

  useEffect(() => {
    if (!open) {
      return
    }

    setLoading(true)
    setError(null)
    Promise.allSettled([api.getSkills(), api.getToolsets(), api.listMcpServers()])
      .then(([skillsResult, toolsetsResult, mcpResult]) => {
        if (skillsResult.status === 'fulfilled') {
          setSkills(skillsResult.value)
        } else {
          throw skillsResult.reason
        }
        setToolsets(toolsetsResult.status === 'fulfilled' ? toolsetsResult.value : [])
        setMcpServers(mcpResult.status === 'fulfilled' ? mcpResult.value.servers ?? [] : [])
      })
      .catch(() => setError(s.loadFailed))
      .finally(() => setLoading(false))
  }, [open, s.loadFailed])

  const toggleSkill = async (name: string, enabled: boolean) => {
    setSkills(prev => prev.map(item => (item.name === name ? { ...item, enabled: !enabled } : item)))

    try {
      await api.setSkillEnabled(name, !enabled)
    } catch {
      setSkills(prev => prev.map(item => (item.name === name ? { ...item, enabled } : item)))
    }
  }

  const toggleToolset = async (name: string, enabled: boolean) => {
    setToolsets(prev => prev.map(item => item.name === name ? { ...item, enabled: !enabled } : item))
    try {
      await api.setToolsetEnabled(name, !enabled)
    } catch {
      setToolsets(prev => prev.map(item => item.name === name ? { ...item, enabled } : item))
    }
  }

  const toggleMcp = async (name: string, enabled: boolean) => {
    setMcpServers(prev => prev.map(item => item.name === name ? { ...item, enabled: !enabled } : item))
    try {
      await api.setMcpServerEnabled(name, !enabled)
    } catch {
      setMcpServers(prev => prev.map(item => item.name === name ? { ...item, enabled } : item))
    }
  }

  const previewSkill = async (name: string) => {
    try {
      setSkillPreview(await api.getSkillContent(name))
    } catch {
      setError(s.previewError)
    }
  }

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={s.title}>
      <div className="mb-3 flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--btn-radius)] bg-(--ui-bg-quaternary) px-2.5 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-(--ui-text-quaternary)"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={s.searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-(--conversation-text-font-size) text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)" />
          <span className="text-(--conversation-tool-font-size) text-(--ui-text-quaternary)">{visibleSkills.length}</span>
        </div>
        <Button onClick={() => setHubOpen(true)} size="sm" variant="secondary">{s.hub}</Button>
      </div>
      {loading && (
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">{t.common.loading}</p>
      )}

      {error && <p className="py-4 text-(--conversation-caption-font-size) text-(--ui-red)">{error}</p>}
      {!loading && !error && visibleSkills.length === 0 && <p className="py-8 text-center text-(--conversation-caption-font-size) text-(--ui-text-quaternary)">{query ? s.noMatches : s.none}</p>}

      <div>
        {visibleSkills.map(skill => (
          <div
            key={skill.name}
            className="w-full flex items-center justify-between py-3 min-h-[3rem] active:bg-(--ui-row-active-background) rounded-md px-1 text-left"
          >
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-(--conversation-text-font-size) text-(--ui-text-primary) truncate font-medium">{skill.name}</p>
              {skill.description && (
                <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary) truncate mt-0.5">
                  {skill.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                className="text-[0.68rem] text-(--ui-accent) hover:underline"
                onClick={() => void previewSkill(skill.name)}
                type="button"
              >
                {s.view}
              </button>
              <Switch
                aria-label={`${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`}
                checked={skill.enabled}
                onChange={() => void toggleSkill(skill.name, skill.enabled)}
              />
            </div>
          </div>
        ))}
      </div>
      {!loading && !error && (
        <div className="mt-5 space-y-4 border-t border-(--ui-stroke-tertiary) pt-4">
          <CapabilitySection description={s.toolsetsDescription} title={s.toolsets}>
            {toolsets.map(toolset => (
              <ToggleRow
                configureLabel={s.configure}
                description={toolset.description}
                enabled={toolset.enabled}
                key={toolset.name}
                label={toolset.label || toolset.name}
                onManage={() => setToolsetConfigName(toolset.name)}
                onToggle={() => void toggleToolset(toolset.name, toolset.enabled)}
                suffix={toolset.configured === false ? s.needsSetup : undefined}
              />
            ))}
            {!toolsets.length ? <EmptyCapability label={s.noToolsets} /> : null}
          </CapabilitySection>
          <CapabilitySection
            description={s.mcpServersDescription}
            title={s.mcpServers}
            action={<Button onClick={() => setMcpOpen(true)} size="sm" variant="secondary">{s.manage}</Button>}
          >
            {mcpServers.map(server => (
              <ToggleRow
                description={server.tools_count === undefined ? undefined : s.toolsCount(server.tools_count)}
                enabled={server.enabled}
                key={server.name}
                label={server.name}
                onToggle={() => void toggleMcp(server.name, server.enabled)}
              />
            ))}
            {!mcpServers.length ? <EmptyCapability label={s.noMcpServers} /> : null}
          </CapabilitySection>
        </div>
      )}
      <SkillHubPage onClose={() => setHubOpen(false)} onInstalled={refreshSkills} open={hubOpen} />
      <McpServersPage onClose={() => setMcpOpen(false)} open={mcpOpen} />
      {toolsetConfigName ? <ToolsetConfigSheet name={toolsetConfigName} onClose={() => setToolsetConfigName(null)} open /> : null}
      {skillPreview ? <ResponsiveSheet compact onClose={() => setSkillPreview(null)} open title={skillPreview.name}><div className="space-y-2"><div className="truncate font-mono text-[0.68rem] text-(--ui-text-quaternary)">{skillPreview.path}</div><pre className="max-h-96 overflow-auto rounded-md bg-black/90 p-3 text-[0.68rem] leading-relaxed text-slate-100 whitespace-pre-wrap">{skillPreview.content}</pre></div></ResponsiveSheet> : null}
    </ResponsiveSheet>
  )
}

function CapabilitySection({ action, children, description, title }: { action?: ReactNode; children: ReactNode; description: string; title: string }) {
  return <section><div className="mb-1.5 flex items-start justify-between gap-2"><div><div className="text-xs font-medium text-(--ui-text-primary)">{title}</div><div className="mt-0.5 text-[0.68rem] text-(--ui-text-quaternary)">{description}</div></div>{action}</div><div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">{children}</div></section>
}

function EmptyCapability({ label }: { label: string }) {
  return <div className="px-3 py-3 text-xs text-(--ui-text-quaternary)">{label}</div>
}

function ToggleRow({
  configureLabel,
  description,
  enabled,
  label,
  onManage,
  onToggle,
  suffix
}: {
  configureLabel?: string
  description?: string
  enabled: boolean
  label: string
  onManage?: () => void
  onToggle: () => void
  suffix?: string
}) {
  return (
    <div className="flex min-h-12 items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 last:border-b-0">
      <button className="min-w-0 flex-1 text-left" onClick={onToggle} type="button">
        <span className="block truncate text-xs font-medium text-(--ui-text-primary)">{label}</span>
        {description || suffix ? (
          <span className="mt-0.5 block truncate text-[0.68rem] text-(--ui-text-quaternary)">{description || suffix}</span>
        ) : null}
      </button>
      {onManage ? (
        <button className="text-[0.68rem] text-(--ui-accent) hover:underline" onClick={onManage} type="button">
          {configureLabel || 'Configure'}
        </button>
      ) : null}
      <Switch
        aria-label={`${enabled ? 'Disable' : 'Enable'} ${label}`}
        checked={enabled}
        onChange={onToggle}
        size="sm"
      />
    </div>
  )
}
