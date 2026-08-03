import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessionInfo } from '@/types/hermes'
import { ActionSheet, type ActionSheetAction } from '@/ui/ActionSheet'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import * as api from '@/gateway/api'
import { useI18n } from '@/i18n'

export interface SidebarProps {
  sessions: SessionInfo[]
  loading: boolean
  activeSessionId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRefresh: () => void
  onFeature: (feature: 'skills' | 'messaging' | 'workspace' | 'cron' | 'settings' | 'gateway' | 'logout') => void
  inDrawer?: boolean
}

export function Sidebar(props: SidebarProps) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [actionTarget, setActionTarget] = useState<SessionInfo | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SessionInfo | null>(null)

  const normalizedSearch = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    return normalizedSearch
      ? props.sessions.filter(session =>
          `${session.title || ''} ${session.preview || ''}`.toLowerCase().includes(normalizedSearch)
        )
      : props.sessions
  }, [normalizedSearch, props.sessions])

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

  const handleLongPress = useCallback((session: SessionInfo) => {
    setActionTarget(session)
  }, [])

  const handleAction = useCallback(
    async (actionId: string) => {
      if (!actionTarget) return
      const id = actionTarget._lineage_root_id ?? actionTarget.id
      switch (actionId) {
        case 'pin':
          try {
            await api.setSessionPinned(id, !actionTarget.pinned)
            props.onRefresh()
          } catch { /* best effort */ }
          break
        case 'archive':
          try {
            await api.setSessionArchived(id, true)
            props.onRefresh()
          } catch { /* best effort */ }
          break
        case 'delete':
          setConfirmDelete(actionTarget)
          break
      }
    },
    [actionTarget, props]
  )

  const confirmDeleteAction = useCallback(
    async (confirmed: boolean) => {
      if (confirmed && confirmDelete) {
        const id = confirmDelete._lineage_root_id ?? confirmDelete.id
        try {
          await api.deleteSession(id)
          props.onRefresh()
        } catch { /* best effort */ }
      }
      setConfirmDelete(null)
    },
    [confirmDelete, props]
  )

  const actions: ActionSheetAction[] = actionTarget
    ? [
        { id: 'pin', label: actionTarget.pinned ? t.sidebar.unpin : t.sidebar.pin },
        { id: 'archive', label: t.sidebar.archive },
        { id: 'delete', label: t.sidebar.deleteSession, destructive: true }
      ]
    : []

  return (
    <div className={cn('flex h-full flex-col bg-(--ui-bg-sidebar)', props.inDrawer ? 'w-full' : 'w-[13.25rem] shrink-0 border-r border-(--ui-stroke-tertiary)')}>
      {/* Top Navigation Actions */}
      <nav className="space-y-0.5 px-2 pb-2 pt-3 shrink-0">
        <SidebarAction
          icon={<Codicon name="add" className="text-sm" />}
          label={t.sidebar.newSession}
          shortcut="⌘ N"
          onClick={props.onNew}
          primary
        />
        <SidebarAction
          icon={<Codicon name="symbol-misc" className="text-sm" />}
          label={t.sidebar.skills}
          onClick={() => props.onFeature('skills')}
        />
        <SidebarAction
          icon={<Codicon name="comment-discussion" className="text-sm" />}
          label={t.sidebar.messaging}
          onClick={() => props.onFeature('messaging')}
        />
        <SidebarAction
          icon={<Codicon name="files" className="text-sm" />}
          label={t.sidebar.artifacts}
          onClick={() => props.onFeature('workspace')}
        />
        <SidebarAction
          icon={<Codicon name="history" className="text-sm" />}
          label={t.sidebar.cron}
          onClick={() => props.onFeature('cron')}
        />
      </nav>

      {/* Search Input */}
      <div className="px-2 pb-2 shrink-0">
        <label className="flex items-center gap-1.5 rounded bg-(--ui-bg-quaternary) px-2 py-1 text-xs text-(--ui-text-tertiary)">
          <Codicon name="search" className="shrink-0 text-xs text-(--ui-text-quaternary)" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t.sidebar.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-(--ui-text-quaternary) text-xs text-(--ui-text-primary)"
          />
        </label>
      </div>

      {/* Sessions List */}
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-2 pb-3">
        {props.loading && !filtered.length && (
          <div className="px-2 py-4 text-xs text-(--ui-text-quaternary)">{t.common.loading}</div>
        )}

        {!props.loading && !filtered.length && (
          <div className="px-2 py-6 text-center text-xs text-(--ui-text-tertiary)">
            {search ? t.sidebar.noMatches : t.sidebar.noSessions}
          </div>
        )}

        {/* Pinned Section */}
        <SidebarSection icon={<Codicon name="pin" className="text-xs" />} title={t.sidebar.pinned}>
          {pinned.length > 0 ? (
            pinned.map(session => (
              <SessionItem
                key={session.id}
                session={session}
                active={props.activeSessionId === (session._lineage_root_id ?? session.id)}
                onSelect={props.onSelect}
                onLongPress={handleLongPress}
              />
            ))
          ) : (
            <div className="px-2 py-1 text-[0.65rem] text-(--ui-text-quaternary) leading-tight">
              {t.sidebar.pinnedHint}
            </div>
          )}
        </SidebarSection>

        {/* Projects Section */}
        <SidebarSection icon={<Codicon name="folder" className="text-xs" />} title={t.sidebar.projects}>
          <button
            onClick={props.onNew}
            className="group flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)"
          >
            <Codicon name="home" className="text-xs text-(--ui-text-quaternary)" />
            <span>{t.sidebar.home}</span>
          </button>
          {projects.map(([name, sessions]) => (
            <div key={name} className="mt-1 mb-2">
              <div className="px-2 py-0.5 text-xs font-medium text-(--ui-text-secondary) flex items-center gap-1.5 truncate">
                <Codicon name="folder" className="text-xs text-(--ui-text-tertiary) shrink-0" />
                <span className="truncate">{name}</span>
              </div>
              {sessions.map(session => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={props.activeSessionId === (session._lineage_root_id ?? session.id)}
                  onSelect={props.onSelect}
                  onLongPress={handleLongPress}
                  nested
                />
              ))}
            </div>
          ))}
        </SidebarSection>

        {/* Recent Section */}
        {recent.length > 0 && (
          <SidebarSection icon={<Codicon name="history" className="text-xs" />} title={t.sidebar.recent}>
            {recent.map(session => (
              <SessionItem
                key={session.id}
                session={session}
                active={props.activeSessionId === (session._lineage_root_id ?? session.id)}
                onSelect={props.onSelect}
                onLongPress={handleLongPress}
              />
            ))}
          </SidebarSection>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="border-t border-(--ui-stroke-tertiary) p-2 space-y-0.5 shrink-0 text-xs text-(--ui-text-tertiary)">
        <SidebarAction
          icon={<Codicon name="settings-gear" className="text-sm" />}
          label={t.sidebar.settings}
          onClick={() => props.onFeature('settings')}
        />
        <SidebarAction
          icon={<Codicon name="server" className="text-sm" />}
          label={t.sidebar.switchGateway}
          onClick={() => props.onFeature('gateway')}
        />
        <SidebarAction
          icon={<Codicon name="log-out" className="text-sm" />}
          label={t.sidebar.logout}
          onClick={() => props.onFeature('logout')}
          destructive
        />
      </div>

      {/* Action Sheets */}
      <ActionSheet
        open={actionTarget !== null}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.title ?? undefined}
        actions={actions}
        onAction={id => void handleAction(id)}
      />

      <ActionSheet
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={t.sidebar.deleteConfirm(confirmDelete?.title ?? t.sidebar.untitled)}
        actions={[{ id: 'confirm', label: t.sidebar.deletePermanently, destructive: true }]}
        onAction={id => void confirmDeleteAction(id === 'confirm')}
      />
    </div>
  )
}

function SidebarSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mb-3">
      <div className="flex items-center gap-1.5 px-2 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-accent)">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  )
}

function SessionItem({
  session,
  active,
  onSelect,
  onLongPress,
  nested = false
}: {
  session: SessionInfo
  active: boolean
  onSelect: (id: string) => void
  onLongPress: (session: SessionInfo) => void
  nested?: boolean
}) {
  const { t } = useI18n()
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  const handleTouchStart = () => {
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      onLongPress(session)
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleClick = () => {
    if (didLongPress.current) {
      didLongPress.current = false
      return
    }
    onSelect(session._lineage_root_id ?? session.id)
  }

  return (
    <button
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      className={cn(
        'group block w-full rounded px-2 py-1 text-left text-xs transition-colors duration-100',
        active
          ? 'bg-(--ui-row-active-background) text-(--ui-text-primary) font-medium'
          : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)',
        nested && 'pl-5'
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate flex-1">
          <span className={cn('mr-1 text-(--ui-text-quaternary)', session.is_active && 'text-(--ui-accent)')}>
            •
          </span>
          {session.title || session.preview || t.sidebar.untitled}
        </span>
        <span className="shrink-0 text-[0.6rem] text-(--ui-text-quaternary)">
          {formatAge(session.last_active, t.sidebar.justNow)}
        </span>
      </div>
      {session.preview && session.title ? (
        <span className="block truncate pl-3 text-[0.65rem] text-(--ui-text-quaternary)">
          {session.preview}
        </span>
      ) : null}
    </button>
  )
}

function formatAge(epochSeconds: number, justNow: string): string {
  if (!epochSeconds) return ''
  const diff = Math.max(0, Date.now() / 1000 - epochSeconds)
  if (diff < 60) return justNow
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function SidebarAction({
  icon,
  label,
  shortcut,
  onClick,
  primary = false,
  destructive = false
}: {
  icon: ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  primary?: boolean
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-100',
        primary
          ? 'font-medium text-(--ui-accent) hover:bg-(--ui-row-active-background)'
          : destructive
          ? 'text-(--ui-red) hover:bg-(--ui-row-active-background)'
          : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
      )}
    >
      <span className="w-4 flex justify-center text-(--ui-text-tertiary)">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="text-[0.6rem] font-mono text-(--ui-text-quaternary) border border-(--ui-stroke-tertiary) rounded px-1 py-0.2">
          {shortcut}
        </span>
      )}
    </button>
  )
}
