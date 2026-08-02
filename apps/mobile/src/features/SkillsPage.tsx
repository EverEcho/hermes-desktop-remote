import { useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { SkillInfo } from '@/types/hermes'
import { BottomSheet } from '@/ui/BottomSheet'
import { cn } from '@/ui/utils'

interface SkillsPageProps {
  open: boolean
  onClose: () => void
}

export function SkillsPage({ open, onClose }: SkillsPageProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setLoading(true)
    api
      .getSkills()
      .then(setSkills)
      .catch(() => {})
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
    <BottomSheet open={open} onClose={onClose} title="Skills" fullScreen>
      {loading && (
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">Loading…</p>
      )}

      <div>
        {skills.map(skill => (
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
    </BottomSheet>
  )
}
