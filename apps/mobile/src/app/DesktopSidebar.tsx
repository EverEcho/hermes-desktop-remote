import { useMemo, useState, type ReactNode } from 'react'
import type { SessionInfo } from '@/types/hermes'
import { cn } from '@/ui/utils'

interface DesktopSidebarProps {
  sessions: SessionInfo[]
  loading: boolean
  activeSessionId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRefresh: () => void
  onFeature: (feature: 'skills' | 'messaging' | 'workspace' | 'cron' | 'settings') => void
}

export function DesktopSidebar(props: DesktopSidebarProps) {
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = useMemo(() => normalizedSearch ? props.sessions.filter(session => `${session.title || ''} ${session.preview || ''}`.toLowerCase().includes(normalizedSearch)) : props.sessions, [normalizedSearch, props.sessions])
  const pinned = filtered.filter(session => session.pinned)
  const unpinned = filtered.filter(session => !session.pinned)
  const recent = unpinned.filter(session => !session.cwd).slice(0, 24)
  const projects = useMemo(() => {
    const map = new Map<string, SessionInfo[]>()
    for (const session of unpinned.filter(session => session.cwd)) {
      const name = session.cwd!.split('/').filter(Boolean).pop() || 'default'
      map.set(name, [...(map.get(name) || []), session])
    }
    return [...map.entries()]
  }, [unpinned])

  return (
    <aside className="hidden w-[13.25rem] shrink-0 flex-col border-r border-(--ui-stroke-tertiary) bg-(--ui-bg-sidebar) md:flex">
      <nav className="space-y-0.5 px-2 pb-3 pt-3">
        <SidebarAction icon="＋" label="New conversation" onClick={props.onNew} />
        <SidebarAction icon="⌁" label="Skills & tools" onClick={() => props.onFeature('skills')} />
        <SidebarAction icon="□" label="Message center" onClick={() => props.onFeature('messaging')} />
        <SidebarAction icon="▣" label="Workspace" onClick={() => props.onFeature('workspace')} />
        <SidebarAction icon="◷" label="Cron jobs" onClick={() => props.onFeature('cron')} />
      </nav>
      <label className="mx-2 mb-2 flex items-center gap-1.5 rounded bg-(--ui-bg-quaternary) px-2 py-1 text-xs text-(--ui-text-tertiary)">
        <span>⌕</span>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search chats…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-(--ui-text-quaternary)" />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <SidebarSection title="Pinned">
          {pinned.map(session => <SessionItem key={session.id} session={session} onSelect={props.onSelect} />)}
        </SidebarSection>
        <SidebarSection title="Projects">
          {projects.map(([name, sessions]) => <div key={name} className="mb-2"><div className="px-2 py-1 text-xs text-(--ui-text-secondary)">⌂ {name}</div>{sessions.slice(0, 5).map(session => <SessionItem key={session.id} session={session} onSelect={props.onSelect} nested />)}</div>)}
        </SidebarSection>
        <SidebarSection title="Recent">
          {props.loading && !filtered.length ? <div className="px-2 py-4 text-xs text-(--ui-text-quaternary)">Loading…</div> : recent.map(session => <SessionItem key={session.id} session={session} onSelect={props.onSelect} />)}
        </SidebarSection>
      </div>
      <div className="border-t border-(--ui-stroke-tertiary) p-2 text-xs text-(--ui-text-tertiary)"><SidebarAction icon="⚙" label="Settings" onClick={() => props.onFeature('settings')} /></div>
    </aside>
  )
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mb-3"><div className="flex items-center gap-1.5 px-2 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-accent)"><span>▦</span>{title}</div>{children}</section>
}

function SessionItem({ session, onSelect, nested = false }: { session: SessionInfo; onSelect: (id: string) => void; nested?: boolean }) {
  return <button onClick={() => onSelect(session._lineage_root_id ?? session.id)} className={cn('group block w-full truncate rounded px-2 py-1 text-left text-xs text-(--ui-text-secondary) hover:bg-(--ui-row-active-background)', nested && 'pl-5')}><span className="mr-1 text-(--ui-text-quaternary)">•</span>{session.title || session.preview || 'Untitled'}<span className="float-right ml-1 text-[0.6rem] text-(--ui-text-quaternary)">{formatAge(session.last_active)}</span>{session.preview && session.title ? <span className="block truncate pl-3 text-[0.65rem] text-(--ui-text-quaternary)">{session.preview}</span> : null}</button>
}

function formatAge(epochSeconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - epochSeconds)
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function SidebarAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)"><span className="w-4 text-center text-(--ui-text-tertiary)">{icon}</span>{label}</button>
}
