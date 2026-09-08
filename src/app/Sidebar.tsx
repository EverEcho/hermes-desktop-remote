import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '@nanostores/react'
import type { SessionInfo } from '@/types/hermes'
import { ActionSheet, type ActionSheetAction } from '@/ui/ActionSheet'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import * as api from '@/gateway/api'
import { $activeSessionId, $sessionTitle, branchStoredSession } from '@/sessions/store'
import { $sessionStates } from '@/sessions/session-states'
import { useI18n } from '@/i18n'
import { openExternalUrl } from '@/native'

export interface SidebarProps {
  sessions: SessionInfo[]
  cronSessions?: SessionInfo[]
  messagingSessions?: SessionInfo[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  showDesktopMeta?: boolean
  sessionScope?: 'active' | 'all'
  activeSessionId: string | null
  onBranch?: (id: string, profile?: string) => Promise<boolean>
  onSelect: (id: string, profile?: string) => void
  onNew: () => void
  onRefresh: () => void
  onLoadMore?: () => void
  onToggleSessionScope?: () => void
  onFeature: (feature: 'skills' | 'messaging' | 'workspace' | 'artifacts' | 'agents' | 'archived' | 'project' | 'memory' | 'learning' | 'logs' | 'computer-use' | 'connections' | 'cron' | 'profiles' | 'webhooks' | 'terminal' | 'settings' | 'gateway' | 'logout') => void
  inDrawer?: boolean
}

export function Sidebar(props: SidebarProps) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [actionTarget, setActionTarget] = useState<SessionInfo | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SessionInfo | null>(null)
  const [showMoreTools, setShowMoreTools] = useState(false)
  const [remoteSearch, setRemoteSearch] = useState<SessionInfo[] | null>(null)
  const showSecondaryTools = !props.inDrawer || showMoreTools

  const normalizedSearch = search.trim().toLowerCase()
  const scopedSessions = useMemo(() => {
    const byId = new Map<string, SessionInfo>()
    for (const session of [...props.sessions, ...(props.cronSessions ?? []), ...(props.messagingSessions ?? [])]) {
      byId.set(session.id, session)
    }
    return [...byId.values()]
  }, [props.sessions, props.cronSessions, props.messagingSessions])
  const filtered = useMemo(() => {
    return normalizedSearch
      ? scopedSessions.filter(session =>
          `${session.title || ''} ${session.preview || ''}`.toLowerCase().includes(normalizedSearch)
        )
      : scopedSessions
  }, [normalizedSearch, scopedSessions])

  /* The loaded sidebar page is intentionally small. Once a query is specific
   * enough, ask the Gateway's indexed search as well so older conversations
   * remain reachable without first paging through the whole account. */
  useEffect(() => {
    // The legacy indexed endpoint searches only the active profile. In the
    // all-profile view, falling back to it would silently replace correct
    // cross-profile local matches with a misleading single-profile result.
    if (normalizedSearch.length < 2 || props.sessionScope === 'all') {
      setRemoteSearch(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void api.searchSessions(normalizedSearch)
        .then(({ results }) => {
          if (cancelled) return
          const localById = new Map(scopedSessions.map(session => [session.id, session]))
          setRemoteSearch(results.map(result => localById.get(result.id) ?? ({
            archived: false,
            ended_at: null,
            id: result.id,
            input_tokens: 0,
            is_active: false,
            last_active: 0,
            message_count: 0,
            model: null,
            output_tokens: 0,
            preview: result.preview,
            source: null,
            started_at: 0,
            title: result.title,
            tool_call_count: 0
          })))
        })
        .catch(() => { if (!cancelled) setRemoteSearch(null) })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [normalizedSearch, props.sessionScope, scopedSessions])

  const visibleSessions = normalizedSearch && remoteSearch ? remoteSearch : normalizedSearch ? filtered : props.sessions

  const pinned = (normalizedSearch ? visibleSessions : scopedSessions).filter(session => session.pinned)
  const unpinned = visibleSessions.filter(session => !session.pinned)
  // Gateway-created runs are separate work queues, not normal recents. Keep
  // them visible in their own sections instead of letting a busy cron or chat
  // bridge crowd a user's ordinary conversations out of the sidebar window.
  const cronSessions = normalizedSearch
    ? unpinned.filter(session => session.source === 'cron')
    : (props.cronSessions ?? unpinned.filter(session => session.source === 'cron')).filter(session => !session.pinned)
  const messagingSessions = normalizedSearch
    ? unpinned.filter(session => Boolean(session.source) && session.source !== 'cron')
    : (props.messagingSessions ?? unpinned.filter(session => Boolean(session.source) && session.source !== 'cron')).filter(session => !session.pinned)
  const recent = unpinned.filter(session => !session.cwd && !session.source).slice(0, 24)

  const projects = useMemo(() => {
    const map = new Map<string, SessionInfo[]>()
    for (const session of unpinned.filter(session => session.cwd && !session.source)) {
      const name = session.cwd!.split('/').filter(Boolean).pop() || 'default'
      map.set(name, [...(map.get(name) || []), session])
    }
    return [...map.entries()]
  }, [unpinned])

  const messagingByPlatform = useMemo(() => {
    const groups = new Map<string, SessionInfo[]>()
    for (const session of messagingSessions) {
      const source = session.source || 'messaging'
      groups.set(source, [...(groups.get(source) ?? []), session])
    }
    return [...groups.entries()]
  }, [messagingSessions])

  const handleLongPress = useCallback((session: SessionInfo) => {
    setActionTarget(session)
  }, [])

  const togglePinned = useCallback(async (session: SessionInfo) => {
    try {
      await api.setSessionPinned(session._lineage_root_id ?? session.id, !session.pinned, session.profile)
      props.onRefresh()
    } catch {
      // Keep the row unchanged when the Gateway rejects the mutation.
    }
  }, [props])

  const handleAction = useCallback(
    async (actionId: string) => {
      if (!actionTarget) return
      const id = actionTarget._lineage_root_id ?? actionTarget.id
      switch (actionId) {
        case 'pin':
          try {
            await api.setSessionPinned(id, !actionTarget.pinned, actionTarget.profile)
            props.onRefresh()
          } catch { /* best effort */ }
          break
        case 'rename': {
          const next = window.prompt(t.sidebar.renamePrompt, actionTarget.title ?? '')

          if (next !== null && next.trim() && next.trim() !== actionTarget.title) {
            try {
              await api.renameSession(id, next.trim(), actionTarget.profile)

              if ($activeSessionId.get() === (actionTarget._lineage_root_id ?? actionTarget.id)) {
                $sessionTitle.set(next.trim())
              }

              props.onRefresh()
            } catch { /* best effort */ }
          }
          break
        }
        case 'archive':
          try {
            await api.setSessionArchived(id, true, actionTarget.profile)
            props.onRefresh()
          } catch { /* best effort */ }
          break
        case 'unread':
          try {
            await api.setSessionUnread(id, !actionTarget.unread, actionTarget.profile)
            props.onRefresh()
          } catch { /* best effort */ }
          break
        case 'copy-id':
          await copyText(id)
          break
        case 'pull-request':
          try {
            const result = await api.scanSessionPullRequests([id])
            const pullRequest = result.pull_requests[id]
            if (pullRequest?.url) await openExternalUrl(pullRequest.url)
            else window.alert('该会话未找到 Pull Request。')
          } catch {
            window.alert('无法从网关读取该会话的 Pull Request。')
          }
          break
        case 'branch':
          if (props.onBranch ? !await props.onBranch(id, actionTarget.profile) : !await branchStoredSession(id)) {
            window.alert('无法从该会话创建分支。')
          }
          break
        case 'export':
          try {
            await exportSession(id, actionTarget)
          } catch {
            window.alert('无法导出该会话。')
          }
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
          await api.deleteSession(id, confirmDelete.profile)
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
        { id: 'unread', label: actionTarget.unread ? t.sidebar.markRead : t.sidebar.markUnread },
        { id: 'copy-id', label: t.sidebar.copyId },
        { id: 'pull-request', label: t.sidebar.openPullRequest },
        { id: 'branch', label: t.sidebar.branch },
        { id: 'export', label: t.sidebar.export },
        { id: 'rename', label: t.sidebar.rename },
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
          icon={<Codicon name="folder-new" className="text-sm" />}
          label={t.sidebar.newProjectSession}
          onClick={() => props.onFeature('project')}
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
          onClick={() => props.onFeature('artifacts')}
        />
        {showSecondaryTools && <>
        <SidebarAction
          icon={<Codicon name="account" className="text-sm" />}
          label={t.sidebar.profiles}
          onClick={() => props.onFeature('profiles')}
        />
        {props.onToggleSessionScope ? <SidebarAction
          icon={<Codicon name="accounts" className="text-sm" />}
          label={props.sessionScope === 'all' ? t.sidebar.currentProfileSessions : t.sidebar.allProfileSessions}
          onClick={props.onToggleSessionScope}
        /> : null}
        <SidebarAction
          icon={<Codicon name="radio-tower" className="text-sm" />}
          label={t.sidebar.webhooks}
          onClick={() => props.onFeature('webhooks')}
        />
        <SidebarAction
          icon={<Codicon name="terminal" className="text-sm" />}
          label={t.sidebar.terminal}
          onClick={() => props.onFeature('terminal')}
        />
        <SidebarAction
          icon={<Codicon name="hubot" className="text-sm" />}
          label={t.sidebar.agents}
          onClick={() => props.onFeature('agents')}
        />
        <SidebarAction
          icon={<Codicon name="database" className="text-sm" />}
          label={t.sidebar.memory}
          onClick={() => props.onFeature('memory')}
        />
        <SidebarAction
          icon={<Codicon name="lightbulb" className="text-sm" />}
          label={t.sidebar.learning}
          onClick={() => props.onFeature('learning')}
        />
        <SidebarAction
          icon={<Codicon name="output" className="text-sm" />}
          label={t.sidebar.logs}
          onClick={() => props.onFeature('logs')}
        />
        <SidebarAction
          icon={<Codicon name="device-camera-video" className="text-sm" />}
          label={t.sidebar.computerUse}
          onClick={() => props.onFeature('computer-use')}
        />
        <SidebarAction
          icon={<Codicon name="archive" className="text-sm" />}
          label={t.sidebar.archived}
          onClick={() => props.onFeature('archived')}
        />
        </>}
        <SidebarAction
          icon={<Codicon name="history" className="text-sm" />}
          label={t.sidebar.cron}
          onClick={() => props.onFeature('cron')}
        />
        {props.inDrawer && <SidebarAction
          icon={<Codicon name={showMoreTools ? 'chevron-up' : 'ellipsis'} className="text-sm" />}
          label={showMoreTools ? t.sidebar.collapseTools : t.sidebar.moreTools}
          onClick={() => setShowMoreTools(value => !value)}
        />}
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
        {props.loading && !visibleSessions.length && (
          <div className="px-2 py-4 text-xs text-(--ui-text-quaternary)">{t.common.loading}</div>
        )}

        {!props.loading && !visibleSessions.length && (
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
                onTogglePin={togglePinned}
                showMeta={props.showDesktopMeta}
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
              <SessionTree
                sessions={sessions}
                activeSessionId={props.activeSessionId}
                onSelect={props.onSelect}
                onLongPress={handleLongPress}
                onTogglePin={togglePinned}
                nested
                showMeta={props.showDesktopMeta}
              />
            </div>
          ))}
        </SidebarSection>

        {/* Recent Section */}
        {recent.length > 0 && (
          <SidebarSection icon={<Codicon name="history" className="text-xs" />} title={t.sidebar.recent}>
            <SessionTree
              sessions={recent}
              activeSessionId={props.activeSessionId}
              onSelect={props.onSelect}
              onLongPress={handleLongPress}
              onTogglePin={togglePinned}
              showMeta={props.showDesktopMeta}
            />
          </SidebarSection>
        )}

        {cronSessions.length > 0 && (
          <SidebarSection icon={<Codicon name="history" className="text-xs" />} title={t.sidebar.scheduledRuns}>
            <SessionTree
              sessions={cronSessions}
              activeSessionId={props.activeSessionId}
              onSelect={props.onSelect}
              onLongPress={handleLongPress}
              onTogglePin={togglePinned}
              showMeta={props.showDesktopMeta}
            />
          </SidebarSection>
        )}

        {messagingByPlatform.length > 0 && (
          <SidebarSection icon={<Codicon name="comment-discussion" className="text-xs" />} title={t.sidebar.messageSessions}>
            {messagingByPlatform.map(([platform, platformSessions]) => (
              <div className="mb-2" key={platform}>
                <div className="px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-wide text-(--ui-text-quaternary)">{platform}</div>
                <SessionTree
                  sessions={platformSessions}
                  activeSessionId={props.activeSessionId}
                  onSelect={props.onSelect}
                  onLongPress={handleLongPress}
                  onTogglePin={togglePinned}
                  showMeta={props.showDesktopMeta}
                />
              </div>
            ))}
          </SidebarSection>
        )}

        {props.hasMore && !search && (
          <button
            className="mx-2 mt-1 w-[calc(100%-1rem)] rounded border border-(--ui-stroke-tertiary) px-2 py-1.5 text-xs text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) disabled:opacity-50"
            disabled={props.loadingMore}
            onClick={props.onLoadMore}
          >
            {props.loadingMore ? t.common.loading : t.sidebar.loadMore}
          </button>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="border-t border-(--ui-stroke-tertiary) p-2 space-y-0.5 shrink-0 text-xs text-(--ui-text-tertiary)">
        <SidebarAction
          icon={<Codicon name="server" className="text-sm" />}
          label={t.sidebar.connections}
          onClick={() => props.onFeature('connections')}
        />
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

/** Render child sessions directly below their stored parent. Only relationships
 * present in this section are followed, so pinning or filtering a parent never
 * makes a child disappear. The visited set also makes malformed cyclic lineage
 * harmless. */
function SessionTree({
  sessions,
  activeSessionId,
  onSelect,
  onLongPress,
  onTogglePin,
  nested = false,
  showMeta = false
}: {
  sessions: SessionInfo[]
  activeSessionId: string | null
  onSelect: (id: string, profile?: string) => void
  onLongPress: (session: SessionInfo) => void
  onTogglePin: (session: SessionInfo) => void
  nested?: boolean
  showMeta?: boolean
}) {
  const byId = new Set(sessions.map(session => session.id))
  const children = new Map<string, SessionInfo[]>()

  for (const session of sessions) {
    const parentId = session.parent_session_id
    if (parentId && byId.has(parentId)) {
      children.set(parentId, [...(children.get(parentId) ?? []), session])
    }
  }

  const roots = sessions.filter(session => !session.parent_session_id || !byId.has(session.parent_session_id))
  const visited = new Set<string>()
  const render = (session: SessionInfo, depth: number): ReactNode => {
    if (visited.has(session.id)) return null
    visited.add(session.id)
    return (
      <div key={session.id}>
        <SessionItem
          session={session}
          active={activeSessionId === (session._lineage_root_id ?? session.id)}
          onSelect={onSelect}
          onLongPress={onLongPress}
          onTogglePin={onTogglePin}
          nested={nested || depth > 0}
          showMeta={showMeta}
        />
        {(children.get(session.id) ?? []).map(child => render(child, depth + 1))}
      </div>
    )
  }

  return <>{roots.map(session => render(session, 0))}</>
}

function SessionItem({
  session,
  active,
  onSelect,
  onLongPress,
  onTogglePin,
  nested = false,
  showMeta = false
}: {
  session: SessionInfo
  active: boolean
  onSelect: (id: string, profile?: string) => void
  onLongPress: (session: SessionInfo) => void
  onTogglePin: (session: SessionInfo) => void
  nested?: boolean
  showMeta?: boolean
}) {
  const { t } = useI18n()
  const sessionStates = useStore($sessionStates)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  const storedId = session._lineage_root_id ?? session.id
  const dotState = sessionStates.get(storedId) ?? sessionStates.get(session.id) ?? null

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

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (didLongPress.current) {
      didLongPress.current = false
      return
    }
    const id = session._lineage_root_id ?? session.id
    if (event.shiftKey) {
      void onTogglePin(session)
      return
    }
    if (session.unread) void api.setSessionUnread(id, false, session.profile).catch(() => undefined)
    onSelect(id, session.profile)
  }

  return (
    <button
      onClick={handleClick}
      onContextMenu={event => {
        event.preventDefault()
        onLongPress(session)
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      className={cn(
        'group block w-full rounded px-2 py-1 text-left text-xs transition-colors duration-100',
        active
          ? 'bg-(--ui-row-active-background) text-(--ui-text-primary) font-medium'
          : cn('text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)', session.unread && 'font-medium text-(--ui-text-primary)'),
        nested && 'pl-5'
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate flex-1">
          <span
            className={cn(
              'mr-1 inline-block size-1.5 rounded-full align-middle',
              dotState === 'needs-input'
                ? 'bg-amber-500'
                : dotState === 'working'
                ? 'bg-(--ui-accent) animate-pulse'
                : session.is_active
                ? 'bg-(--ui-accent)'
                : 'bg-(--ui-text-quaternary)'
            )}
          />
          {session.unread && <span className="mr-1 inline-block size-1.5 rounded-full bg-(--ui-accent) align-middle" aria-label="Unread" />}
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
      {showMeta && (session.model || session.input_tokens || session.output_tokens || session.actual_cost_usd || session.estimated_cost_usd) ? (
        <span className="block truncate pl-3 pt-0.5 text-[0.6rem] text-(--ui-text-quaternary)">
          {[session.profile, session.model, formatSessionUsage(session)].filter(Boolean).join(' · ')}
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

function formatSessionUsage(session: SessionInfo): string {
  const tokens = Math.max(0, session.input_tokens || 0) + Math.max(0, session.output_tokens || 0)
  const cost = session.actual_cost_usd ?? session.estimated_cost_usd
  const values: string[] = []
  if (tokens) values.push(`${tokens >= 1_000 ? `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}k` : tokens} tok`)
  if (typeof cost === 'number' && cost > 0) values.push(`$${cost.toFixed(cost >= 1 ? 2 : 3)}`)
  return values.join(' · ')
}

/** Browser-safe export of a Gateway transcript. Fetch pages newest-first and
 * reverse the final aggregate so the downloaded JSON reads chronologically. */
async function exportSession(id: string, session: SessionInfo): Promise<void> {
  const limit = 240
  const pages = []
  let offset = 0

  while (true) {
    const page = await api.getSessionMessages(id, { includeCompacted: true, limit, offset, order: 'latest', profile: session.profile })
    pages.push(...page.messages)
    const returned = page.pagination?.returned ?? page.messages.length
    // Older Gateways did not advertise transcript pagination. Treat their
    // one response as complete rather than repeatedly requesting offset 240.
    if (!page.pagination || returned < limit) break
    offset += returned
  }

  const payload = {
    exported_at: new Date().toISOString(),
    message_count: pages.length,
    messages: pages.reverse(),
    session,
    session_id: id,
    title: session.title
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const title = (session.title || 'session').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'session'
  anchor.href = url
  anchor.download = `${title}-${id.slice(0, 8)}.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** Clipboard API is absent in some Capacitor/Tauri WebViews and on insecure
 * development origins. Keep the action useful there without adding a native
 * desktop-only dependency. */
async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall through to the DOM clipboard command below.
    }
  }

  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
  document.body.append(input)
  input.select()
  document.execCommand('copy')
  input.remove()
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
