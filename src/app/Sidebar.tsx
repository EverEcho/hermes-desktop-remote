import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '@nanostores/react'
import type { SessionInfo } from '@/types/hermes'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import * as api from '@/gateway/api'
import { $authState, switchProfile } from '@/auth'
import { $connectionState, $subagentsBySession } from '@/gateway'
import { $activeSessionId, $sessionTitle, branchStoredSession, isMessagingSessionSource } from '@/sessions/store'
import { $sessionStates } from '@/sessions/session-states'
import { useI18n } from '@/i18n'
import { openExternalUrl } from '@/native'
import type { ProfileInfo } from '@/types/hermes'

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
  onNew: (cwd?: string) => void
  onRefresh: () => void
  onLoadMore?: () => void
  onToggleSessionScope?: () => void
  onFeature: (feature: 'skills' | 'messaging' | 'workspace' | 'artifacts' | 'agents' | 'archived' | 'project' | 'memory' | 'learning' | 'logs' | 'computer-use' | 'connections' | 'cron' | 'profiles' | 'webhooks' | 'terminal' | 'settings' | 'gateway' | 'logout') => void
  inDrawer?: boolean
}

export function Sidebar(props: SidebarProps) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [menuTarget, setMenuTarget] = useState<{ session: SessionInfo; pos: { x: number; y: number } } | null>(null)
  const [showMoreTools, setShowMoreTools] = useState(false)
  const [remoteSearch, setRemoteSearch] = useState<SessionInfo[] | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})

  const toggleFolder = useCallback((name: string) => {
    setCollapsedFolders(prev => ({ ...prev, [name]: !prev[name] }))
  }, [])

  const handleOpenMenu = useCallback((session: SessionInfo, pos: { x: number; y: number }) => {
    setMenuTarget({ session, pos })
  }, [])

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
    ? unpinned.filter(session => isMessagingSessionSource(session.source))
    : (props.messagingSessions ?? unpinned.filter(session => isMessagingSessionSource(session.source))).filter(session => !session.pinned)

  // Interactive sessions: unpinned sessions that are not cron runs and not messaging platform bots
  const interactiveSessions = useMemo(() => {
    return unpinned.filter(session => session.source !== 'cron' && !isMessagingSessionSource(session.source))
  }, [unpinned])

  const projects = useMemo(() => {
    const map = new Map<string, { path: string; sessions: SessionInfo[] }>()
    for (const session of interactiveSessions.filter(session => Boolean(session.cwd))) {
      const path = session.cwd!
      const name = path.split('/').filter(Boolean).pop() || 'default'
      if (name.startsWith('.')) continue // Skip hidden directories like .hermes
      const existing = map.get(name)
      if (existing) {
        existing.sessions.push(session)
      } else {
        map.set(name, { path, sessions: [session] })
      }
    }
    return [...map.entries()]
  }, [interactiveSessions])

  const homeSessions = useMemo(() => {
    return interactiveSessions.filter(session => !session.cwd)
  }, [interactiveSessions])

  const messagingByPlatform = useMemo(() => {
    const groups = new Map<string, SessionInfo[]>()
    for (const session of messagingSessions) {
      const source = session.source || 'messaging'
      groups.set(source, [...(groups.get(source) ?? []), session])
    }
    return [...groups.entries()]
  }, [messagingSessions])

  const togglePinned = useCallback(async (session: SessionInfo) => {
    try {
      await api.setSessionPinned(session._lineage_root_id ?? session.id, !session.pinned, session.profile)
      props.onRefresh()
    } catch {
      // Keep the row unchanged when the Gateway rejects the mutation.
    }
  }, [props])

  const handleArchive = useCallback(async (session: SessionInfo) => {
    try {
      await api.setSessionArchived(session._lineage_root_id ?? session.id, true, session.profile)
      props.onRefresh()
    } catch {
      // Keep unchanged on failure
    }
  }, [props])

  const handleAction = useCallback(
    async (actionId: string, targetSession?: SessionInfo) => {
      const session = targetSession ?? menuTarget?.session
      if (!session) return
      const id = session._lineage_root_id ?? session.id
      switch (actionId) {
        case 'pin':
          try {
            await api.setSessionPinned(id, !session.pinned, session.profile)
            props.onRefresh()
          } catch { /* best effort */ }
          break
        case 'rename': {
          const next = window.prompt(t.sidebar.renamePrompt, session.title ?? '')

          if (next !== null && next.trim() && next.trim() !== session.title) {
            try {
              await api.renameSession(id, next.trim(), session.profile)

              if ($activeSessionId.get() === id) {
                $sessionTitle.set(next.trim())
              }

              props.onRefresh()
            } catch { /* best effort */ }
          }
          break
        }
        case 'archive':
          try {
            await api.setSessionArchived(id, true, session.profile)
            props.onRefresh()
          } catch { /* best effort */ }
          break
        case 'unread':
          try {
            await api.setSessionUnread(id, !session.unread, session.profile)
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
          if (props.onBranch ? !await props.onBranch(id, session.profile) : !await branchStoredSession(id)) {
            window.alert('无法从该会话创建分支。')
          }
          break
        case 'export':
          try {
            await exportSession(id, session)
          } catch {
            window.alert('无法导出该会话。')
          }
          break
        case 'delete': {
          const title = session.title || session.preview || t.sidebar.untitled
          if (window.confirm(t.sidebar.deleteConfirm(title))) {
            try {
              await api.deleteSession(id, session.profile)
              props.onRefresh()
            } catch { /* best effort */ }
          }
          break
        }
      }
    },
    [menuTarget, props, t]
  )

  const [activeTab, setActiveTab] = useState<'sessions' | 'bots'>('sessions')

  return (
    <div className={cn('flex h-full w-full flex-col bg-(--ui-bg-sidebar)', !props.inDrawer && 'shrink-0')}>
      {/* 顶部 SESSIONS | BOTS 切换 Tab（桌面端对齐原版 PC） */}
      {!props.inDrawer && (
        <div className="flex items-center border-b border-(--ui-stroke-quaternary) px-2.5 pt-2 pb-1.5 shrink-0 select-none gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={cn(
              'flex-1 rounded py-0.5 text-center text-[10px] font-bold tracking-wider transition-colors uppercase',
              activeTab === 'sessions'
                ? 'bg-(--ui-bg-elevated) text-(--ui-accent) shadow-xs'
                : 'text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)'
            )}
          >
            SESSIONS
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bots')}
            className={cn(
              'flex-1 rounded py-0.5 text-center text-[10px] font-bold tracking-wider transition-colors uppercase',
              activeTab === 'bots'
                ? 'bg-(--ui-bg-elevated) text-(--ui-accent) shadow-xs'
                : 'text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)'
            )}
          >
            BOTS
          </button>
        </div>
      )}

      {/* 原版 PC 核心导航区 (5 大固定入口) */}
      <nav className="space-y-0.5 px-2 pb-2 pt-2 shrink-0">
        <SidebarAction
          icon={<Codicon name="robot" className="text-sm" />}
          label={t.sidebar.newSession}
          shortcut={!props.inDrawer ? '⌘ N' : undefined}
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
          onClick={() => props.onFeature('artifacts')}
        />
        <SidebarAction
          icon={<Codicon name="history" className="text-sm" />}
          label={t.sidebar.cron}
          onClick={() => props.onFeature('cron')}
        />

        {props.inDrawer && (
          <>
            {showMoreTools && (
              <>
                <SidebarAction
                  icon={<Codicon name="folder-new" className="text-sm" />}
                  label={t.sidebar.newProjectSession}
                  onClick={() => props.onFeature('project')}
                />
                <SidebarAction
                  icon={<Codicon name="account" className="text-sm" />}
                  label={t.sidebar.profiles}
                  onClick={() => props.onFeature('profiles')}
                />
                {props.onToggleSessionScope ? (
                  <SidebarAction
                    icon={<Codicon name="accounts" className="text-sm" />}
                    label={props.sessionScope === 'all' ? t.sidebar.currentProfileSessions : t.sidebar.allProfileSessions}
                    onClick={props.onToggleSessionScope}
                  />
                ) : null}
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
              </>
            )}
            <SidebarAction
              icon={<Codicon name={showMoreTools ? 'chevron-up' : 'ellipsis'} className="text-sm" />}
              label={showMoreTools ? t.sidebar.collapseTools : t.sidebar.moreTools}
              onClick={() => setShowMoreTools(value => !value)}
            />
          </>
        )}
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

      {/* Sessions List 或 BOTS List */}
      {activeTab === 'bots' ? (
        <BotsRoster
          search={search}
          onFeature={props.onFeature}
          onNewSession={props.onNew}
          onSelectSession={props.onSelect}
          sessions={props.sessions}
        />
      ) : (
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
        <SidebarSection
          icon={<Codicon name="pin" className="text-xs" />}
          title={t.sidebar.pinned}
          extra={pinned.length > 0 ? t.sidebar.pinnedHint : undefined}
        >
          {pinned.length > 0 ? (
            pinned.map(session => (
              <SessionItem
                key={session.id}
                session={session}
                active={props.activeSessionId === (session._lineage_root_id ?? session.id)}
                onSelect={props.onSelect}
                onMenu={handleOpenMenu}
                onTogglePin={togglePinned}
                onArchive={handleArchive}
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
        {projects.length > 0 && (
          <SidebarSection icon={<Codicon name="folder" className="text-xs" />} title={t.sidebar.projects}>
            {/* Home bucket for detached sessions */}
            {homeSessions.length > 0 && (
              <div className="mb-1.5">
                <div
                  className="group flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) cursor-pointer select-none"
                  onClick={() => toggleFolder('__home__')}
                >
                  <div className="flex items-center gap-1.5 truncate min-w-0 flex-1">
                    <Codicon name="home" className="text-xs text-(--ui-text-tertiary) shrink-0" />
                    <span className="truncate font-medium text-(--ui-text-primary)">{t.sidebar.home}</span>
                    <span className="text-[0.62rem] text-(--ui-text-quaternary) font-mono">({homeSessions.length})</span>
                    <Codicon
                      name={collapsedFolders['__home__'] ? 'chevron-right' : 'chevron-down'}
                      className="text-[0.62rem] text-(--ui-text-quaternary) opacity-0 transition-opacity group-hover:opacity-100 shrink-0 ml-auto"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      props.onNew()
                    }}
                    className="opacity-0 group-hover:opacity-100 text-(--ui-text-quaternary) hover:text-(--ui-text-primary) p-0.5 rounded transition ml-1"
                    title={t.sidebar.newSession}
                  >
                    <Codicon name="add" className="text-xs" />
                  </button>
                </div>
                {!collapsedFolders['__home__'] && (
                  <div className="ml-3.5 pl-2 border-l border-(--ui-stroke-quaternary)/50 mt-0.5">
                    <SessionTree
                      sessions={homeSessions}
                      activeSessionId={props.activeSessionId}
                      onSelect={props.onSelect}
                      onMenu={handleOpenMenu}
                      onTogglePin={togglePinned}
                      onArchive={handleArchive}
                      nested
                      showMeta={props.showDesktopMeta}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Project folders */}
            {projects.map(([name, { path, sessions }]) => {
              const isCollapsed = Boolean(collapsedFolders[name])
              return (
                <div key={name} className="mt-0.5 mb-1.5">
                  <div
                    className="group flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) cursor-pointer select-none"
                    onClick={() => toggleFolder(name)}
                    title={path}
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0 flex-1">
                      <Codicon
                        name={isCollapsed ? 'folder' : 'folder-opened'}
                        className="text-xs text-(--ui-text-tertiary) shrink-0"
                      />
                      <span className="truncate font-medium text-(--ui-text-primary)">{name}</span>
                      <span className="text-[0.62rem] text-(--ui-text-quaternary) font-mono">({sessions.length})</span>
                      <Codicon
                        name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                        className="text-[0.62rem] text-(--ui-text-quaternary) opacity-0 transition-opacity group-hover:opacity-100 shrink-0 ml-auto"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        props.onNew(path)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-(--ui-text-quaternary) hover:text-(--ui-text-primary) p-0.5 rounded transition ml-1"
                      title={t.desktop.commands.newProjectSession}
                    >
                      <Codicon name="add" className="text-xs" />
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="ml-3.5 pl-2 border-l border-(--ui-stroke-quaternary)/50 mt-0.5">
                      <SessionTree
                        sessions={sessions}
                        activeSessionId={props.activeSessionId}
                        onSelect={props.onSelect}
                        onMenu={handleOpenMenu}
                        onTogglePin={togglePinned}
                        onArchive={handleArchive}
                        nested
                        showMeta={props.showDesktopMeta}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </SidebarSection>
        )}

        {/* When no projects exist, render flat Recent section */}
        {projects.length === 0 && interactiveSessions.length > 0 && (
          <SidebarSection icon={<Codicon name="history" className="text-xs" />} title={t.sidebar.recent}>
            <SessionTree
              sessions={interactiveSessions.slice(0, 30)}
              activeSessionId={props.activeSessionId}
              onSelect={props.onSelect}
              onMenu={handleOpenMenu}
              onTogglePin={togglePinned}
              onArchive={handleArchive}
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
              onMenu={handleOpenMenu}
              onTogglePin={togglePinned}
              onArchive={handleArchive}
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
                  onMenu={handleOpenMenu}
                  onTogglePin={togglePinned}
                  onArchive={handleArchive}
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
      )}

      {/* 底部操作区 (仅移动端抽屉展示) */}
      {props.inDrawer && (
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
      )}

      {/* Floating Session Menu / Popover */}
      <SessionFloatingMenu
        target={menuTarget}
        onClose={() => setMenuTarget(null)}
        onAction={(actionId, session) => {
          setMenuTarget(null)
          void handleAction(actionId, session)
        }}
      />
    </div>
  )
}

function SidebarSection({ icon, title, extra, children }: { icon: ReactNode; title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-3">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-accent)">
          {icon}
          <span>{title}</span>
        </div>
        {extra && (
          <span className="text-[0.6rem] text-(--ui-text-quaternary) font-normal">
            {extra}
          </span>
        )}
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
  onMenu,
  onTogglePin,
  onArchive,
  nested = false,
  showMeta = false
}: {
  sessions: SessionInfo[]
  activeSessionId: string | null
  onSelect: (id: string, profile?: string) => void
  onMenu: (session: SessionInfo, pos: { x: number; y: number }) => void
  onTogglePin: (session: SessionInfo) => void
  onArchive: (session: SessionInfo) => void
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
          onMenu={onMenu}
          onTogglePin={onTogglePin}
          onArchive={onArchive}
          nested={nested || depth > 0}
          showMeta={showMeta}
        />
        {(children.get(session.id) ?? []).map(child => render(child, depth + 1))}
      </div>
    )
  }

  return <div className="flex flex-col gap-0.5">{roots.map(session => render(session, 0))}</div>
}

function SessionItem({
  session,
  active,
  onSelect,
  onMenu,
  onTogglePin,
  onArchive,
  nested = false
}: {
  session: SessionInfo
  active: boolean
  onSelect: (id: string, profile?: string) => void
  onMenu: (session: SessionInfo, pos: { x: number; y: number }) => void
  onTogglePin: (session: SessionInfo) => void
  onArchive: (session: SessionInfo) => void
  nested?: boolean
  showMeta?: boolean
}) {
  const { t } = useI18n()
  const sessionStates = useStore($sessionStates)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const storedId = session._lineage_root_id ?? session.id
  const dotState = sessionStates.get(storedId) ?? sessionStates.get(session.id) ?? null

  const handleTouchStart = (e: React.TouchEvent) => {
    didLongPress.current = false
    const touch = e.touches[0]
    if (touch) {
      touchStartPos.current = { x: touch.clientX, y: touch.clientY }
    }
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      onMenu(session, touchStartPos.current)
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
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

  const title = session.title || session.preview || t.sidebar.untitled
  const age = formatAge(session.last_active, t.sidebar.justNow)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick(e as unknown as React.MouseEvent<HTMLDivElement>)
        }
      }}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
        onMenu(session, { x: event.clientX, y: event.clientY })
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      title={title}
      className={cn(
        'group relative flex items-center min-h-[1.875rem] w-full rounded-md px-2 py-1 text-left text-xs transition-colors duration-75 cursor-pointer select-none gap-2',
        active
          ? 'bg-(--ui-row-active-background) text-(--ui-text-primary) font-medium'
          : cn('text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)', session.unread && 'font-medium text-(--ui-text-primary)'),
        nested && 'pl-2'
      )}
    >
      {/* Lead status dot */}
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          dotState === 'needs-input'
            ? 'bg-amber-500'
            : dotState === 'working'
            ? 'bg-(--ui-accent) animate-pulse'
            : session.is_active
            ? 'bg-(--ui-accent)'
            : 'bg-(--ui-text-quaternary) group-hover:bg-(--ui-text-tertiary)'
        )}
      />
      {session.unread && <span className="size-1.5 shrink-0 rounded-full bg-(--ui-accent)" aria-label="Unread" />}

      {/* Title */}
      <span className="truncate flex-1 min-w-0 text-xs leading-normal">
        {title}
      </span>

      {/* Trailing slot: right-aligned */}
      <div className="shrink-0 flex items-center justify-end">
        {/* Pinned status glyph (shown when pinned and not hovering) */}
        {session.pinned && (
          <Codicon
            name="pinned"
            className="text-[0.65rem] text-(--ui-text-tertiary) shrink-0 mr-1 group-hover:hidden"
          />
        )}

        {/* Age: flush to the right edge when not hovering */}
        {age && (
          <span className="text-[0.65rem] text-(--ui-text-quaternary) font-mono group-hover:hidden whitespace-nowrap">
            {age}
          </span>
        )}

        {/* Hover action buttons: only squeezed in on mouse hover */}
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              void onTogglePin(session)
            }}
            title={session.pinned ? t.sidebar.unpin : t.sidebar.pin}
            className="size-5 rounded flex items-center justify-center text-(--ui-text-quaternary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
          >
            <Codicon name={session.pinned ? 'pinned' : 'pin'} className="text-[0.7rem]" />
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              void onArchive(session)
            }}
            title={t.sidebar.archive}
            className="size-5 rounded flex items-center justify-center text-(--ui-text-quaternary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
          >
            <Codicon name="archive" className="text-[0.7rem]" />
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              onMenu(session, { x: rect.right - 170, y: rect.bottom + 4 })
            }}
            title={t.sidebar.moreTools}
            className="size-5 rounded flex items-center justify-center text-(--ui-text-quaternary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
          >
            <Codicon name="ellipsis" className="text-[0.7rem]" />
          </button>
        </div>
      </div>
    </div>
  )
}

interface SessionFloatingMenuProps {
  target: { session: SessionInfo; pos: { x: number; y: number } } | null
  onClose: () => void
  onAction: (actionId: string, session: SessionInfo) => void
}

function SessionFloatingMenu({ target, onClose, onAction }: SessionFloatingMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!target) {
      setCoords(null)
      return
    }

    const menuEl = menuRef.current
    const width = menuEl?.offsetWidth || 176
    const height = menuEl?.offsetHeight || 280
    const padding = 8

    let x = target.pos.x
    let y = target.pos.y

    if (x + width > window.innerWidth - padding) {
      x = Math.max(padding, window.innerWidth - width - padding)
    }
    if (y + height > window.innerHeight - padding) {
      y = Math.max(padding, window.innerHeight - height - padding)
    }

    setCoords({ x: Math.round(x), y: Math.round(y) })

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const handleScroll = () => {
      onClose()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [target, onClose])

  if (!target) return null
  const { session } = target

  const menuItems: Array<{
    id: string
    label: string
    icon: string
    destructive?: boolean
    separator?: boolean
  }> = [
    {
      id: 'pin',
      label: session.pinned ? t.sidebar.unpin : t.sidebar.pin,
      icon: session.pinned ? 'pinned' : 'pin'
    },
    {
      id: 'rename',
      label: t.sidebar.rename,
      icon: 'edit'
    },
    {
      id: 'unread',
      label: session.unread ? t.sidebar.markRead : t.sidebar.markUnread,
      icon: session.unread ? 'pass' : 'mail'
    },
    {
      id: 'branch',
      label: t.sidebar.branch,
      icon: 'git-branch'
    },
    {
      id: 'copy-id',
      label: t.sidebar.copyId,
      icon: 'copy'
    },
    {
      id: 'export',
      label: t.sidebar.export,
      icon: 'cloud-download'
    },
    {
      id: 'archive',
      label: t.sidebar.archive,
      icon: 'archive'
    },
    {
      id: 'delete',
      label: t.sidebar.deletePermanently,
      icon: 'trash',
      destructive: true,
      separator: true
    }
  ]

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: coords ? `${coords.x}px` : `${target.pos.x}px`,
        top: coords ? `${coords.y}px` : `${target.pos.y}px`,
        zIndex: 100,
        opacity: coords ? 1 : 0
      }}
      className="min-w-[170px] rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-1 shadow-2xl backdrop-blur-md transition-opacity duration-75 select-none"
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="px-2 py-1 text-[0.65rem] font-medium text-(--ui-text-quaternary) truncate border-b border-(--ui-stroke-quaternary) mb-1">
        {session.title || session.preview || t.sidebar.untitled}
      </div>
      {menuItems.map(item => (
        <Fragment key={item.id}>
          {item.separator && <div className="my-1 h-px bg-(--ui-stroke-quaternary)" />}
          <button
            type="button"
            onClick={() => onAction(item.id, session)}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors cursor-pointer',
              item.destructive
                ? 'text-red-500 hover:bg-red-500/10'
                : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)'
            )}
          >
            <Codicon name={item.icon} className="text-xs shrink-0" />
            <span className="truncate flex-1">{item.label}</span>
          </button>
        </Fragment>
      ))}
    </div>
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

function BotsRoster({
  search,
  onFeature,
  onNewSession,
  onSelectSession,
  sessions
}: {
  search: string
  onFeature: (feature: 'skills' | 'messaging' | 'workspace' | 'artifacts' | 'agents' | 'archived' | 'project' | 'memory' | 'learning' | 'logs' | 'computer-use' | 'connections' | 'cron' | 'profiles' | 'webhooks' | 'terminal' | 'settings' | 'gateway' | 'logout') => void
  onNewSession: () => void
  onSelectSession: (id: string, profile?: string) => void
  sessions: SessionInfo[]
}) {
  const authState = useStore($authState)
  const connectionState = useStore($connectionState)
  const subagentsMap = useStore($subagentsBySession)

  const [profiles, setProfiles] = useState<ProfileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newBotName, setNewBotName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const activeProfile = authState.status === 'authenticated' ? authState.profile : 'default'

  const fetchProfiles = useCallback(async () => {
    if (connectionState !== 'open') return
    setLoading(true)
    try {
      const res = await api.getProfiles()
      if (res?.profiles) {
        setProfiles(res.profiles)
      }
    } catch {
      // best effort
    } finally {
      setLoading(false)
    }
  }, [connectionState])

  useEffect(() => {
    void fetchProfiles()
  }, [fetchProfiles])

  const handleCreateBot = async () => {
    const name = newBotName.trim()
    if (!name || submitting) return
    setSubmitting(true)
    try {
      await api.createProfile({ name })
      setNewBotName('')
      setCreating(false)
      await fetchProfiles()
      await switchProfile(name)
      onNewSession()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '创建智能体失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectBot = async (botName: string) => {
    if (botName !== activeProfile) {
      await switchProfile(botName)
    }
    const botSession = sessions.find(s => (s.profile || 'default') === botName)
    if (botSession) {
      onSelectSession(botSession.id, botName)
    } else {
      onNewSession()
    }
  }

  const activeSubagents = useMemo(() => {
    return [...subagentsMap.values()]
      .flat()
      .filter(item => item.status === 'running' || item.status === 'queued')
  }, [subagentsMap])

  const getBotColor = (name: string) => {
    const colors = [
      'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
      'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
      'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30',
      'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
      'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
    return colors[hash % colors.length]
  }

  const query = search.trim().toLowerCase()
  const displayProfiles = profiles.length > 0 ? profiles : [{ name: 'default' }]
  const filteredBots = displayProfiles.filter(p => !query || p.name.toLowerCase().includes(query))

  return (
    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-2 pb-3 space-y-3">
      {/* 头部统计与新建 Bot */}
      <div className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-bg-card)/60 p-2.5 space-y-2 select-none">
        <div className="flex items-center justify-between text-xs font-semibold text-(--ui-text-primary)">
          <div className="flex items-center gap-1.5">
            <Codicon name="hubot" className="text-sm text-(--ui-accent)" />
            <span>智能体网络</span>
          </div>
          <button
            type="button"
            onClick={() => setCreating(!creating)}
            className="flex items-center gap-1 rounded bg-(--ui-bg-elevated) px-1.5 py-0.5 text-[10px] font-medium text-(--ui-accent) hover:opacity-80 transition-opacity"
            title="新建智能体 (Profile)"
          >
            <Codicon name="add" className="text-[10px]" />
            <span>新建</span>
          </button>
        </div>
        <p className="text-[11px] text-(--ui-text-tertiary) leading-snug">
          {filteredBots.length} 个智能体已就绪 · 当前处于 <span className="font-mono font-medium text-(--ui-text-primary)">{activeProfile}</span>
        </p>

        {/* 展开的新建输入框 */}
        {creating && (
          <div className="pt-1.5 border-t border-(--ui-stroke-quaternary) space-y-1.5">
            <input
              type="text"
              value={newBotName}
              onChange={e => setNewBotName(e.target.value)}
              placeholder="智能体名称 (如 coder, ops)..."
              className="w-full rounded border border-(--ui-stroke-tertiary) bg-(--ui-bg-chrome) px-2 py-1 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"
              onKeyDown={e => e.key === 'Enter' && void handleCreateBot()}
              autoFocus
            />
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded px-2 py-0.5 text-[10px] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!newBotName.trim() || submitting}
                onClick={() => void handleCreateBot()}
                className="rounded bg-(--ui-accent) px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
              >
                {submitting ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 正在运行中的 Subagents 委托任务 */}
      {activeSubagents.length > 0 && (
        <SidebarSection
          icon={<Codicon name="loading" spinning className="text-xs text-(--ui-accent)" />}
          title={`正在执行的任务 (${activeSubagents.length})`}
        >
          {activeSubagents.map(task => (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelectSession(task.sessionId)}
              className="group flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-(--chrome-action-hover) transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="truncate font-medium text-(--ui-text-primary)">{task.goal}</span>
                <span className="text-[9px] font-mono text-(--ui-accent)">执行中</span>
              </div>
              {task.tool && (
                <span className="truncate font-mono text-[10px] text-(--ui-text-tertiary)">{task.tool}</span>
              )}
            </button>
          ))}
        </SidebarSection>
      )}

      {/* Bot Roster 花名册列表 */}
      <SidebarSection icon={<Codicon name="robot" className="text-xs" />} title="智能体花名册 (Roster)">
        {loading && filteredBots.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-(--ui-text-quaternary)">
            <Codicon name="loading" spinning className="mr-1 inline-block" />
            加载智能体…
          </div>
        ) : filteredBots.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-(--ui-text-tertiary)">未找到匹配智能体</div>
        ) : (
          filteredBots.map(bot => {
            const isActive = bot.name === activeProfile
            const colorClass = getBotColor(bot.name)
            const initial = (bot.name[0] || 'B').toUpperCase()

            return (
              <div
                key={bot.name}
                onClick={() => void handleSelectBot(bot.name)}
                className={cn(
                  'group flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors cursor-pointer select-none',
                  isActive
                    ? 'bg-(--ui-row-active-background) text-(--ui-text-primary)'
                    : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* 彩色头像 */}
                  <div
                    className={cn(
                      'relative flex size-6 shrink-0 items-center justify-center rounded border font-bold text-[11px]',
                      colorClass
                    )}
                  >
                    <span>{initial}</span>
                    {isActive && (
                      <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500 ring-1 ring-(--ui-bg-sidebar)" />
                    )}
                  </div>

                  {/* 名字与状态 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 truncate">
                      <span className="truncate font-medium">{bot.name}</span>
                      {isActive && (
                        <span className="rounded bg-emerald-500/15 px-1 py-0.2 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                          当前
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 快捷操作 */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      onFeature('cron')
                    }}
                    className="flex size-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--ui-bg-elevated)"
                    title="定时任务"
                  >
                    <Codicon name="history" className="text-xs" />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      onFeature('profiles')
                    }}
                    className="flex size-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--ui-bg-elevated)"
                    title="配置此智能体"
                  >
                    <Codicon name="settings-gear" className="text-xs" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </SidebarSection>
    </div>
  )
}
