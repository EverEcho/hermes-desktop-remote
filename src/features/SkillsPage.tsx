import { useEffect, useMemo, useState } from 'react'

import * as api from '@/gateway/api'
import type { SkillInfo } from '@/types/hermes'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface SkillsPageProps {
  open: boolean
  onClose: () => void
}

export function SkillsPage({ open, onClose }: SkillsPageProps) {
  const { t } = useI18n()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
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
    api
      .getSkills()
      .then(setSkills)
      .catch(() => setError(t.skills.loadFailed))
      .finally(() => setLoading(false))
  }, [open])

  const toggleSkill = async (name: string, enabled: boolean) => {
    setSkills(prev => prev.map(s => (s.name === name ? { ...s, enabled: !enabled } : s)))

    try {
      await api.setSkillEnabled(name, !enabled)
    } catch {
      setSkills(prev => prev.map(s => (s.name === name ? { ...s, enabled } : s)))
    }
  }

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={t.skills.title}>
      <div className="mb-3 flex items-center gap-2 rounded-[var(--btn-radius)] bg-(--ui-bg-quaternary) px-2.5 py-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-(--ui-text-quaternary)"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t.skills.searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-(--conversation-text-font-size) text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)" />
        <span className="text-(--conversation-tool-font-size) text-(--ui-text-quaternary)">{visibleSkills.length}</span>
      </div>
      {loading && (
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">{t.common.loading}</p>
      )}

      {error && <p className="py-4 text-(--conversation-caption-font-size) text-(--ui-red)">{error}</p>}
      {!loading && !error && visibleSkills.length === 0 && <p className="py-8 text-center text-(--conversation-caption-font-size) text-(--ui-text-quaternary)">{query ? t.skills.noMatches : t.skills.none}</p>}

      <div>
        {visibleSkills.map(skill => (
          <button
            key={skill.name}
            className="w-full flex items-center justify-between py-3 min-h-[3rem] active:bg-(--ui-row-active-background) rounded-md px-1 text-left"
            onClick={() => void toggleSkill(skill.name, skill.enabled)}
          >
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-(--conversation-text-font-size) text-(--ui-text-primary) truncate">{skill.name}</p>
              {skill.description && (
                <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary) truncate mt-0.5">
                  {skill.description}
                </p>
              )}
            </div>
            <div
              className={cn(
                'w-10 h-6 rounded-full relative transition-colors shrink-0',
                skill.enabled ? 'bg-(--theme-primary)' : 'bg-(--ui-bg-quaternary)'
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform',
                  skill.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                )}
              />
            </div>
          </button>
        ))}
      </div>
    </ResponsiveSheet>
  )
}
