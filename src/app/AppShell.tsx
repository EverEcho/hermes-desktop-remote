import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $connectionState, $gatewayProfile, getGateway, reconnectGateway } from '@/gateway'
import { $pendingApprovals, $pendingClarifications, $pendingMcpSetup, $pendingSecrets, $pendingSudo, onGatewayEvent, resolveApproval, resolveClarification, resolveClarificationBatch, resolveMcpSetup, resolveSecret, resolveSudo, type ClarifyRequest, type McpSetupRequest } from '@/gateway'
import * as api from '@/gateway/api'
import { $sessions, $cronSessions, $messagingSessions, $sessionsHasMore, $sessionsLoading, $sessionsLoadingMore, $sessionScope, $activeSessionId, $currentCwd, $sessionTitle, refreshSessions, loadMoreSessions, openSession, closeSession, createNewSession, setSessionScope, branchStoredSession } from '@/sessions/store'
import { $authState, logout, switchProfile } from '@/auth'
import { Drawer } from '@/ui/Drawer'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { SessionDetail } from '@/sessions/SessionDetail'
import { MobileHeader } from '@/components/MobileHeader'
import { SettingsPage } from '@/settings/SettingsPage'
import { WorkspaceSheet } from '@/workspace/WorkspaceSheet'
import { SkillsPage } from '@/features/SkillsPage'
import { CronPage } from '@/features/CronPage'
import { MessagingPage } from '@/features/MessagingPage'
import { ProfilesPage } from '@/features/ProfilesPage'
import { WebhooksPage } from '@/features/WebhooksPage'
import { TerminalPage } from '@/features/TerminalPage'
import { ArtifactsPage } from '@/features/ArtifactsPage'
import { AgentsPage } from '@/features/AgentsPage'
import { ArchivedSessionsPage } from '@/features/ArchivedSessionsPage'
import { ProjectSessionPage } from '@/features/ProjectSessionPage'
import { MemoryPage } from '@/features/MemoryPage'
import { LearningPage } from '@/features/LearningPage'
import { LogsPage } from '@/features/LogsPage'
import { ComputerUsePage } from '@/features/ComputerUsePage'
import { ConnectionsPage } from '@/features/ConnectionsPage'
import { useI18n } from '@/i18n'
import { Sidebar } from './Sidebar'
import { NewSessionHome } from './NewSessionHome'
import { DesktopTitlebar } from './DesktopTitlebar'
import { DesktopWorkspacePanel, type RemotePreviewTarget } from '@/workspace/DesktopWorkspacePanel'
import { DesktopCommandPalette, type DesktopCommand } from '@/desktop/CommandPalette'
import { DesktopSessionPicker } from '@/desktop/SessionPicker'
import { DesktopSessionTabs } from '@/desktop/SessionTabs'
import { DesktopStatusBar } from '@/desktop/DesktopStatusBar'
import { openExternalUrl } from '@/native'
import type { AppSurface } from '@/bootstrap/runtime'

const LEFT_SIDEBAR_KEY = 'rhermes.desktop.left-sidebar'
const RIGHT_SIDEBAR_KEY = 'rhermes.desktop.right-sidebar'

function loadPanelPreference(key: string, fallback: boolean): boolean {
  const saved = window.localStorage.getItem(key)
  return saved === null ? fallback : saved === 'true'
}

export function AppShell({ onChangeGateway, surface }: { onChangeGateway: () => void; surface: AppSurface }) {
  const { t } = useI18n()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [cronOpen, setCronOpen] = useState(false)
  const [messagingOpen, setMessagingOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
  const [desktopTabs, setDesktopTabs] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem('rhermes-desktop-tabs')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem('rhermes-desktop-tabs', JSON.stringify(desktopTabs))
    } catch {
      // best effort
    }
  }, [desktopTabs])
  const [pendingProfileSession, setPendingProfileSession] = useState<{ id: string; profile: string; task: 'branch' | 'open' } | null>(null)
  const pendingBranchResolve = useRef<{ id: string; profile: string; resolve: (created: boolean) => void } | null>(null)
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [webhooksOpen, setWebhooksOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [archivedSessionsOpen, setArchivedSessionsOpen] = useState(false)
  const [projectSessionOpen, setProjectSessionOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [learningOpen, setLearningOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [computerUseOpen, setComputerUseOpen] = useState(false)
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(() => loadPanelPreference(LEFT_SIDEBAR_KEY, true))
  const [rightSidebarVisible, setRightSidebarVisible] = useState(() => loadPanelPreference(RIGHT_SIDEBAR_KEY, true))
  const [desktopPreviewTarget, setDesktopPreviewTarget] = useState<RemotePreviewTarget | null>(null)
  const isDesktopSurface = surface === 'desktop'
  const connectionState = useStore($connectionState)
  const gatewayProfile = useStore($gatewayProfile)
  const sessions = useStore($sessions)
  const cronSessions = useStore($cronSessions)
  const messagingSessions = useStore($messagingSessions)
  const sessionsLoading = useStore($sessionsLoading)
  const sessionsLoadingMore = useStore($sessionsLoadingMore)
  const sessionsHasMore = useStore($sessionsHasMore)
  const sessionScope = useStore($sessionScope)
  const authState = useStore($authState)
  const activeSessionId = useStore($activeSessionId)
  const currentCwd = useStore($currentCwd)
  const sessionTitle = useStore($sessionTitle)
  const pendingApprovals = useStore($pendingApprovals)
  const pendingClarifications = useStore($pendingClarifications)
  const pendingSecrets = useStore($pendingSecrets)
  const pendingSudo = useStore($pendingSudo)
  const pendingMcpSetup = useStore($pendingMcpSetup)

  useEffect(() => {
    window.localStorage.setItem(LEFT_SIDEBAR_KEY, String(leftSidebarVisible))
  }, [leftSidebarVisible])

  useEffect(() => {
    window.localStorage.setItem(RIGHT_SIDEBAR_KEY, String(rightSidebarVisible))
  }, [rightSidebarVisible])

  useEffect(() => {
    api.setGatewaySessionSource(isDesktopSurface ? 'desktop' : 'mobile')
  }, [isDesktopSurface])

  // AppShell mounts before the parent has necessarily finished configuring
  // the HTTP client. Load the initial session list only after the gateway is
  // open; this also restores the list automatically after a reconnect.
  useEffect(() => {
    if (connectionState === 'open') {
      void refreshSessions()
    }
  }, [connectionState])

  /* Live session-list sync (Desktop live-sync parity). session.reclaimed moves
   * the row's ended_at without a sessions.changed broadcast. */
  useEffect(() => {
    return onGatewayEvent(event => {
      if (event.type === 'sessions.changed' || event.type === 'session.reclaimed') {
        void refreshSessions()
      }
    })
  }, [])

  const handleSelectSession = useCallback((id: string, profile?: string) => {
    setDrawerOpen(false)
    if (profile && authState.status === 'authenticated' && profile !== authState.profile) {
      setPendingProfileSession({ id, profile, task: 'open' })
      void switchProfile(profile)
      return
    }
    if (isDesktopSurface) {
      setDesktopTabs(tabs => tabs.includes(id) ? tabs : [...tabs, id])
    }
    void openSession(id)
  }, [authState, isDesktopSurface])

  const handleBranchSession = useCallback(async (id: string, profile?: string): Promise<boolean> => {
    if (profile && authState.status === 'authenticated' && profile !== authState.profile) {
      return new Promise(resolve => {
        pendingBranchResolve.current = { id, profile, resolve }
        setPendingProfileSession({ id, profile, task: 'branch' })
        void switchProfile(profile).catch(() => {
          if (pendingBranchResolve.current?.id === id && pendingBranchResolve.current.profile === profile) {
            pendingBranchResolve.current.resolve(false)
            pendingBranchResolve.current = null
          }
          setPendingProfileSession(null)
        })
      })
    }
    return Boolean(await branchStoredSession(id))
  }, [authState])

  useEffect(() => {
    if (!pendingProfileSession || connectionState !== 'open' || gatewayProfile !== pendingProfileSession.profile || authState.status !== 'authenticated' || authState.profile !== pendingProfileSession.profile) return
    const next = pendingProfileSession
    setPendingProfileSession(null)
    if (next.task === 'branch') {
      void branchStoredSession(next.id).then(created => {
        const pending = pendingBranchResolve.current
        if (pending?.id === next.id && pending.profile === next.profile) {
          pending.resolve(Boolean(created))
          pendingBranchResolve.current = null
        }
      })
      return
    }
    handleSelectSession(next.id, next.profile)
  }, [authState, connectionState, gatewayProfile, handleSelectSession, pendingProfileSession])

  const handleNewSession = useCallback(async () => {
    setDrawerOpen(false)
    const id = await createNewSession()
    if (id && isDesktopSurface) {
      setDesktopTabs(tabs => tabs.includes(id) ? tabs : [...tabs, id])
    }
  }, [isDesktopSurface])

  const handleCloseDesktopTab = useCallback((id: string) => {
    setDesktopTabs(tabs => {
      const index = tabs.indexOf(id)
      const next = tabs.filter(tabId => tabId !== id)
      if (id === $activeSessionId.get()) {
        const replacement = next[index] ?? next[index - 1] ?? null
        if (replacement) void openSession(replacement)
        else closeSession()
      }
      return next
    })
  }, [])

  const handleCloseOtherDesktopTabs = useCallback((keepId: string) => {
    setDesktopTabs([keepId])
    if ($activeSessionId.get() !== keepId) {
      void openSession(keepId)
    }
  }, [])

  const handleCloseAllDesktopTabs = useCallback(() => {
    setDesktopTabs([])
    closeSession()
  }, [])

  // Desktop keeps the productive shortcuts on the desktop surface only. The
  // mobile UI deliberately has no keyboard contract, while the browser can
  // opt into the desktop surface at bootstrap and receives the same behavior
  // as Tauri without switching UI trees on resize.
  useEffect(() => {
    if (!isDesktopSurface) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true

      if (!(event.metaKey || event.ctrlKey) || typing) return

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setSessionPickerOpen(true)
        return
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void handleNewSession()
        return
      }

      if (event.key.toLowerCase() === 'w') {
        if (activeSessionId) {
          event.preventDefault()
          handleCloseDesktopTab(activeSessionId)
        }
        return
      }

      if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        if (event.shiftKey) {
          if (activeSessionId && currentCwd) setRightSidebarVisible(value => !value)
        } else {
          setLeftSidebarVisible(value => !value)
        }
        return
      }

      if (event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeSessionId, currentCwd, handleCloseDesktopTab, handleNewSession, isDesktopSurface])

  const handleBack = useCallback(() => {
    closeSession()
  }, [])

  const handleRetry = useCallback(() => {
    void reconnectGateway()
  }, [])

  const handleFeature = useCallback(
    (feature: 'skills' | 'messaging' | 'workspace' | 'artifacts' | 'agents' | 'archived' | 'project' | 'memory' | 'learning' | 'logs' | 'computer-use' | 'connections' | 'cron' | 'profiles' | 'webhooks' | 'terminal' | 'settings' | 'gateway' | 'logout') => {
      setDrawerOpen(false)
      if (feature === 'skills') setSkillsOpen(true)
      if (feature === 'messaging') setMessagingOpen(true)
      if (feature === 'workspace') setWorkspaceOpen(true)
      if (feature === 'artifacts') setArtifactsOpen(true)
      if (feature === 'agents') setAgentsOpen(true)
      if (feature === 'archived') setArchivedSessionsOpen(true)
      if (feature === 'project') setProjectSessionOpen(true)
      if (feature === 'memory') setMemoryOpen(true)
      if (feature === 'learning') setLearningOpen(true)
      if (feature === 'logs') setLogsOpen(true)
      if (feature === 'computer-use') setComputerUseOpen(true)
      if (feature === 'connections') setConnectionsOpen(true)
      if (feature === 'cron') setCronOpen(true)
      if (feature === 'profiles') setProfilesOpen(true)
      if (feature === 'webhooks') setWebhooksOpen(true)
      if (feature === 'terminal') setTerminalOpen(true)
      if (feature === 'settings') setSettingsOpen(true)
      if (feature === 'gateway') onChangeGateway()
      if (feature === 'logout') void logout()
    },
    [onChangeGateway]
  )

  const desktopCommands: DesktopCommand[] = [
    { id: 'new-session', icon: 'add', label: t.desktop.commands.newSession, shortcut: '⌘ N', run: () => void handleNewSession() },
    { id: 'new-project-session', icon: 'folder-new', label: t.desktop.commands.newProjectSession, description: t.desktop.commands.newProjectSessionDesc, run: () => setProjectSessionOpen(true) },
    { id: 'toggle-left-sidebar', icon: 'layout-sidebar-left', label: leftSidebarVisible ? t.desktop.commands.hideLeftSidebar : t.desktop.commands.showLeftSidebar, shortcut: '⌘ B', run: () => setLeftSidebarVisible(value => !value) },
    { id: 'settings', icon: 'settings-gear', label: t.desktop.commands.openSettings, shortcut: '⌘ ,', run: () => setSettingsOpen(true) },
    { id: 'skills', icon: 'symbol-misc', label: t.desktop.commands.openSkills, run: () => setSkillsOpen(true) },
    { id: 'artifacts', icon: 'files', label: t.desktop.commands.browseArtifacts, description: t.desktop.commands.browseArtifactsDesc, run: () => setArtifactsOpen(true) },
    { id: 'agents', icon: 'hubot', label: t.desktop.commands.viewAgents, description: t.desktop.commands.viewAgentsDesc, run: () => setAgentsOpen(true) },
    { id: 'memory', icon: 'database', label: t.desktop.commands.memoryCurator, description: t.desktop.commands.memoryCuratorDesc, run: () => setMemoryOpen(true) },
    { id: 'learning', icon: 'lightbulb', label: t.desktop.commands.learningMap, description: t.desktop.commands.learningMapDesc, run: () => setLearningOpen(true) },
    { id: 'logs', icon: 'output', label: t.desktop.commands.gatewayLogs, description: t.desktop.commands.gatewayLogsDesc, run: () => setLogsOpen(true) },
    { id: 'computer-use', icon: 'device-camera-video', label: t.desktop.commands.computerUse, description: t.desktop.commands.computerUseDesc, run: () => setComputerUseOpen(true) },
    { id: 'connections', icon: 'server', label: t.desktop.commands.manageGateways, description: t.desktop.commands.manageGatewaysDesc, run: () => setConnectionsOpen(true) },
    { id: 'archived', icon: 'archive', label: t.desktop.commands.archivedSessions, description: t.desktop.commands.archivedSessionsDesc, run: () => setArchivedSessionsOpen(true) },
    { id: 'profiles', icon: 'account', label: t.desktop.commands.manageProfiles, run: () => setProfilesOpen(true) },
    { id: 'webhooks', icon: 'radio-tower', label: t.desktop.commands.manageWebhooks, run: () => setWebhooksOpen(true) },
    { id: 'terminal', icon: 'terminal', label: t.desktop.commands.remoteTerminal, description: t.desktop.commands.remoteTerminalDesc, run: () => setTerminalOpen(true) },
    { id: 'messaging', icon: 'comment-discussion', label: t.desktop.commands.openMessaging, run: () => setMessagingOpen(true) },
    { id: 'cron', icon: 'history', label: t.desktop.commands.openCron, run: () => setCronOpen(true) },
    { id: 'change-gateway', icon: 'server', label: t.desktop.commands.connectAnotherGateway, run: onChangeGateway }
  ]

  if (activeSessionId && currentCwd) {
    desktopCommands.splice(2, 0,
      { id: 'workspace', icon: 'folder-opened', label: t.desktop.commands.openWorkspace, run: () => setWorkspaceOpen(true) },
      { id: 'toggle-right-sidebar', icon: 'layout-sidebar-right', label: rightSidebarVisible ? t.desktop.commands.hideFileList : t.desktop.commands.showFileList, shortcut: '⌘ ⇧ B', run: () => setRightSidebarVisible(value => !value) }
    )
  }

  const handlePreviewTarget = useCallback((target: { kind: 'file' | 'url'; value: string }) => {
    if (!isDesktopSurface) {
      if (target.kind === 'url') {
        void openExternalUrl(target.value)
      } else {
        setWorkspaceOpen(true)
      }
      return
    }
    setRightSidebarVisible(true)
    setDesktopPreviewTarget(target)
  }, [isDesktopSurface])

  return (
    <div className="h-full flex flex-col bg-(--ui-bg-chrome) overflow-hidden">
      {isDesktopSurface ? (
        <DesktopTitlebar
          connectionState={connectionState}
          leftSidebarVisible={leftSidebarVisible}
          rightSidebarVisible={rightSidebarVisible && Boolean(currentCwd)}
          rightSidebarAvailable={Boolean(activeSessionId && currentCwd)}
          title={activeSessionId ? sessionTitle || 'RHermes' : 'RHermes'}
          onToggleLeftSidebar={() => setLeftSidebarVisible(value => !value)}
          onToggleRightSidebar={() => setRightSidebarVisible(value => !value)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenWorkspace={() => setWorkspaceOpen(true)}
          onRetry={handleRetry}
        />
      ) : null}

      {/* 主工作区（上层平面：包含左侧栏、中间内容、右侧工作台） */}
      <div className="flex min-h-0 flex-1 w-full overflow-hidden">
        {/* Desktop Sidebar (hidden on mobile) */}
        <div className={leftSidebarVisible ? (isDesktopSurface ? 'flex shrink-0' : 'hidden md:flex shrink-0') : 'hidden'}>
        <Sidebar
          sessions={sessions}
          cronSessions={cronSessions}
          messagingSessions={messagingSessions}
          loading={sessionsLoading}
          loadingMore={sessionsLoadingMore}
          hasMore={sessionsHasMore}
          showDesktopMeta={isDesktopSurface}
          sessionScope={sessionScope}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onBranch={handleBranchSession}
          onNew={handleNewSession}
          onRefresh={() => void refreshSessions()}
          onLoadMore={() => void loadMoreSessions()}
          onToggleSessionScope={() => setSessionScope(sessionScope === 'all' ? 'active' : 'all')}
          onFeature={handleFeature}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader
          className="app-mobile-header"
          onMenuPress={() => setDrawerOpen(true)}
          onSettingsPress={() => setSettingsOpen(true)}
          connectionState={connectionState}
          onRetry={handleRetry}
          title={activeSessionId ? sessionTitle ?? undefined : 'RHermes'}
          subtitle={activeSessionId && currentCwd ? currentCwd.split('/').pop() : undefined}
          onBack={activeSessionId ? handleBack : undefined}
          onWorkspacePress={activeSessionId ? () => setWorkspaceOpen(true) : undefined}
        />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {isDesktopSurface ? (
              <DesktopSessionTabs
                activeSessionId={activeSessionId}
                onClose={handleCloseDesktopTab}
                onCloseAll={handleCloseAllDesktopTabs}
                onCloseOthers={handleCloseOtherDesktopTabs}
                onSelect={handleSelectSession}
                sessions={sessions}
                tabIds={desktopTabs}
              />
            ) : null}
            <div className="min-h-0 flex-1">
              {activeSessionId ? (
                <SessionDetail onPreview={handlePreviewTarget} sessionId={activeSessionId} />
              ) : (
                <NewSessionHome onSelectSession={handleSelectSession} />
              )}
            </div>
          </div>

        {/* Mobile Drawer (uses identical unified Sidebar component) */}
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <Sidebar
            sessions={sessions}
            cronSessions={cronSessions}
            messagingSessions={messagingSessions}
            loading={sessionsLoading}
            loadingMore={sessionsLoadingMore}
            hasMore={sessionsHasMore}
            showDesktopMeta={isDesktopSurface}
            sessionScope={sessionScope}
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
            onBranch={handleBranchSession}
            onNew={handleNewSession}
            onRefresh={() => void refreshSessions()}
            onLoadMore={() => void loadMoreSessions()}
            onToggleSessionScope={() => setSessionScope(sessionScope === 'all' ? 'active' : 'all')}
            onFeature={handleFeature}
            inDrawer
          />
        </Drawer>

      <SettingsPage open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorkspaceSheet open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} cwd={currentCwd || undefined} />
      <SkillsPage open={skillsOpen} onClose={() => setSkillsOpen(false)} />
      <CronPage open={cronOpen} onClose={() => setCronOpen(false)} onOpenSession={id => { setCronOpen(false); handleSelectSession(id) }} />
      <MessagingPage open={messagingOpen} onClose={() => setMessagingOpen(false)} />
      <ProfilesPage open={profilesOpen} onClose={() => setProfilesOpen(false)} />
      <WebhooksPage open={webhooksOpen} onClose={() => setWebhooksOpen(false)} />
      <TerminalPage onClose={() => setTerminalOpen(false)} open={terminalOpen} sessionId={activeSessionId} />
      <ArtifactsPage
        onClose={() => setArtifactsOpen(false)}
        onOpenSession={id => { setArtifactsOpen(false); handleSelectSession(id) }}
        onPreview={value => {
          handlePreviewTarget({ kind: /^https?:\/\//i.test(value) ? 'url' : 'file', value })
          setArtifactsOpen(false)
        }}
        open={artifactsOpen}
      />
      <AgentsPage onClose={() => setAgentsOpen(false)} onOpenSession={id => { setAgentsOpen(false); handleSelectSession(id) }} open={agentsOpen} />
      <ArchivedSessionsPage onClose={() => setArchivedSessionsOpen(false)} onOpenSession={id => { setArchivedSessionsOpen(false); handleSelectSession(id) }} open={archivedSessionsOpen} />
      <ProjectSessionPage onClose={() => setProjectSessionOpen(false)} open={projectSessionOpen} />
      <MemoryPage onClose={() => setMemoryOpen(false)} open={memoryOpen} />
      <LearningPage onClose={() => setLearningOpen(false)} open={learningOpen} />
      <LogsPage onClose={() => setLogsOpen(false)} open={logsOpen} />
      <ComputerUsePage onClose={() => setComputerUseOpen(false)} open={computerUseOpen} />
      <ConnectionsPage onAddConnection={onChangeGateway} onClose={() => setConnectionsOpen(false)} open={connectionsOpen} />

      {pendingApprovals.length > 0 && (
        <ApprovalSheet
          requestId={pendingApprovals[0].requestId}
          command={pendingApprovals[0].command}
          description={pendingApprovals[0].description}
          allowPermanent={pendingApprovals[0].allowPermanent}
          choices={pendingApprovals[0].choices}
          smartDenied={pendingApprovals[0].smartDenied}
        />
      )}

      {pendingSudo.length > 0 && (
        <SudoSheet requestId={pendingSudo[0].requestId} />
      )}

      {pendingClarifications.length > 0 && (
        <ClarifySheet
          key={pendingClarifications[0].requestId}
          request={pendingClarifications[0]}
        />
      )}

      {pendingSecrets.length > 0 && (
        <SecretSheet
          requestId={pendingSecrets[0].requestId}
          envVar={pendingSecrets[0].envVar}
          prompt={pendingSecrets[0].prompt}
        />
      )}

      {pendingMcpSetup.length > 0 && (
        <McpSetupSheet request={pendingMcpSetup[0]} />
      )}
      {isDesktopSurface ? (
        <>
          <DesktopCommandPalette
            commands={desktopCommands}
            onClose={() => setCommandPaletteOpen(false)}
            open={commandPaletteOpen}
          />
          <DesktopSessionPicker
            activeSessionId={activeSessionId}
            onClose={() => setSessionPickerOpen(false)}
            onOpen={handleSelectSession}
            open={sessionPickerOpen}
            sessions={sessions}
          />
        </>
      ) : null}
      </div>

      {isDesktopSurface && rightSidebarVisible && currentCwd ? (
          <DesktopWorkspacePanel
            cwd={currentCwd}
            externalPreview={desktopPreviewTarget}
            onClose={() => setRightSidebarVisible(false)}
            onOpenTerminal={() => setTerminalOpen(true)}
            onOpenWorkspace={() => setWorkspaceOpen(true)}
            onPreviewConsumed={() => setDesktopPreviewTarget(null)}
          />
        ) : null}
      </div>

      {/* 底部通栏状态栏（下层平面：横跨整屏宽度，left / content / right 在同一个水平基准面） */}
      {isDesktopSurface && (
        <DesktopStatusBar
          clientVersion="v0.17.0"
          leftSidebarVisible={leftSidebarVisible}
          sessionScope={sessionScope}
          onChangeGateway={onChangeGateway}
          onFeature={handleFeature}
          onNewSession={handleNewSession}
          onOpenAgents={() => setAgentsOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenConnections={() => setConnectionsOpen(true)}
          onOpenCron={() => setCronOpen(true)}
          onOpenWebhooks={() => setWebhooksOpen(true)}
          onToggleSessionScope={() => setSessionScope(sessionScope === 'all' ? 'active' : 'all')}
          onToggleWorkspace={() => setRightSidebarVisible(v => !v)}
        />
      )}
    </div>
  )
}

function McpSetupSheet({ request }: { request: McpSetupRequest }) {
  const { t } = useI18n()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decline = () => resolveMcpSetup(request.requestId, { server: request.server, status: 'declined' })
  const allow = async () => {
    setWorking(true)
    setError(null)
    try {
      if (request.action === 'install') {
        await api.installMcpCatalogEntry(request.server)
        await reloadMcpForSession(request.sessionId)
        resolveMcpSetup(request.requestId, { server: request.server, status: 'installed' })
      } else if (request.action === 'enable') {
        await api.setMcpServerEnabled(request.server, true)
        await reloadMcpForSession(request.sessionId)
        resolveMcpSetup(request.requestId, { server: request.server, status: 'enabled' })
      } else {
        const flow = await api.authMcpServer(request.server)
        if (flow.authorization_url) void openExternalUrl(flow.authorization_url)
        if (flow.status === 'approved') {
          resolveMcpSetup(request.requestId, { server: request.server, status: 'authorized' })
        } else {
          const result = await waitForMcpAuthorization(flow.flow_id)
          if (result.status !== 'approved') throw new Error(result.error || t.approvals.mcpSetupAuthFailed)
          await reloadMcpForSession(request.sessionId)
          resolveMcpSetup(request.requestId, { server: request.server, status: 'authorized' })
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setWorking(false)
    }
  }

  return (
    <ResponsiveSheet compact open onClose={decline} title={t.approvals.mcpSetupTitle}>
      <div className="space-y-3">
        <p className="text-xs text-(--ui-text-secondary)">{request.reason || t.approvals.mcpSetupDescription}</p>
        <p className="rounded-md bg-(--ui-widget-surface-background) px-3 py-2 text-xs font-medium text-(--ui-text-primary)">{request.server}</p>
        {error && <p className="text-xs text-(--ui-red)">{error}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={working} onClick={() => void allow()}>{working ? t.common.saving : t.approvals.mcpSetupAllow}</Button>
          <Button className="flex-1" variant="secondary" disabled={working} onClick={decline}>{t.approvals.deny}</Button>
        </div>
      </div>
    </ResponsiveSheet>
  )
}

async function reloadMcpForSession(sessionId: string): Promise<void> {
  try {
    await getGateway()?.request('reload.mcp', { confirm: true, session_id: sessionId || undefined })
  } catch {
    // The config write already succeeded; an older gateway may not expose
    // reload.mcp and will pick it up on the next session.
  }
}

async function waitForMcpAuthorization(flowId: string): Promise<{ status: string; error?: string | null }> {
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => window.setTimeout(resolve, 2_000))
    const result = await api.getMcpOAuthFlow(flowId)
    if (result.status === 'approved' || result.status === 'error') return result
  }
  return { status: 'error', error: 'Authorization timed out' }
}

function ApprovalSheet({ requestId, command, description, allowPermanent, choices, smartDenied }: { requestId: string; command?: string; description?: string; allowPermanent?: boolean; choices?: string[]; smartDenied?: boolean }) {
  const { t } = useI18n()
  const availableChoices = choices ?? (smartDenied ? ['once', 'deny'] : undefined)
  const canAlwaysAllow = availableChoices ? availableChoices.includes('always') : allowPermanent !== false

  return (
    <ResponsiveSheet compact open onClose={() => {}} title={t.approvals.approvalRequired}>
      <div className="space-y-3">
        {description && <p className="text-xs text-(--ui-text-secondary)">{description}</p>}
        {command && (
          <pre className="text-[0.6875rem] font-mono bg-(--ui-widget-surface-background) rounded-[var(--btn-radius)] p-2.5 overflow-x-auto text-(--ui-text-secondary) select-text">
            {command}
          </pre>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => resolveApproval(requestId, true)}>{t.approvals.approve}</Button>
          <Button className="flex-1" variant="secondary" onClick={() => resolveApproval(requestId, false)}>{t.approvals.deny}</Button>
        </div>
        {canAlwaysAllow && (
          <Button className="w-full" variant="secondary" onClick={() => resolveApproval(requestId, true, true)}>
            {t.approvals.alwaysAllow}
          </Button>
        )}
      </div>
    </ResponsiveSheet>
  )
}

function SudoSheet({ requestId }: { requestId: string }) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')

  return (
    <ResponsiveSheet compact open onClose={() => resolveSudo(requestId, '')} title={t.approvals.sudoTitle}>
      <div className="space-y-3">
        <p className="text-xs text-(--ui-text-secondary)">{t.approvals.sudoDesc}</p>
        <Input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={t.approvals.sudoPlaceholder}
          className="font-mono"
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={!password}
            onClick={() => {
              resolveSudo(requestId, password)
              setPassword('')
            }}
          >
            {t.approvals.submit}
          </Button>
          <Button className="flex-1" variant="secondary" onClick={() => resolveSudo(requestId, '')}>
            {t.approvals.deny}
          </Button>
        </div>
      </div>
    </ResponsiveSheet>
  )
}

function ClarifySheet({ request }: { request: ClarifyRequest }) {
  const { t } = useI18n()
  const [answer, setAnswer] = useState('')
  const [batchAnswers, setBatchAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const questions = request.questions ?? []

  useEffect(() => {
    if (request.lockedAnswers) {
      setBatchAnswers(current => ({ ...request.lockedAnswers, ...current }))
    }
  }, [request.lockedAnswers])

  if (questions.length > 0) {
    const complete = questions.every(question => Boolean(batchAnswers[question.qid]?.trim()))

    return (
      <ResponsiveSheet compact open onClose={() => {}} title={t.approvals.inputNeeded}>
        <div className="space-y-4">
          {questions.map(question => (
            <div key={question.qid} className="space-y-2">
              <p className="text-xs text-(--ui-text-primary)">{question.question}</p>
              {question.choices?.length ? (
                <div className="space-y-1">
                  {question.choices.map(choice => (
                    <Button
                      key={choice}
                      variant={isBatchChoiceSelected(batchAnswers[question.qid], choice, question.multiSelect) ? 'default' : 'secondary'}
                      className="w-full justify-start"
                      onClick={() => setBatchAnswers(current => ({
                        ...current,
                        [question.qid]: question.multiSelect
                          ? JSON.stringify(toggleBatchChoices(current[question.qid], choice))
                          : choice
                      }))}
                    >
                      {choice}
                    </Button>
                  ))}
                </div>
              ) : (
                <Input
                  value={batchAnswers[question.qid] ?? ''}
                  onChange={event => setBatchAnswers(current => ({ ...current, [question.qid]: event.target.value }))}
                  placeholder={t.approvals.answerPlaceholder}
                />
              )}
            </div>
          ))}
          <Button
            className="w-full"
            disabled={!complete || submitting}
            onClick={() => {
              setSubmitting(true)
              void resolveClarificationBatch(
                request.requestId,
                questions.map(question => ({ questionId: question.qid, answer: batchAnswers[question.qid].trim() }))
              ).catch(() => setSubmitting(false))
            }}
          >
            {t.approvals.submit}
          </Button>
        </div>
      </ResponsiveSheet>
    )
  }

  return (
    <ResponsiveSheet compact open onClose={() => {}} title={t.approvals.inputNeeded}>
      <div className="space-y-3">
        <p className="text-xs text-(--ui-text-primary)">{request.question}</p>

        {request.choices && request.choices.length > 0 ? (
          <div className="space-y-1">
            {request.choices.map(choice => (
              <Button
                key={choice}
                variant="secondary"
                className="w-full justify-start"
                onClick={() => resolveClarification(request.requestId, choice)}
              >
                {choice}
              </Button>
            ))}
          </div>
        ) : (
          <>
            <Input
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder={t.approvals.answerPlaceholder}
            />
            <Button
              className="w-full"
              disabled={!answer.trim()}
              onClick={() => resolveClarification(request.requestId, answer.trim())}
            >
              {t.approvals.submit}
            </Button>
          </>
        )}
      </div>
    </ResponsiveSheet>
  )
}

function SecretSheet({ requestId, envVar, prompt }: { requestId: string; envVar: string; prompt?: string }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')

  return (
    <ResponsiveSheet compact open onClose={() => {}} title={t.approvals.credentialRequired}>
      <div className="space-y-3">
        <p className="text-xs text-(--ui-text-secondary)">{prompt ?? t.approvals.credentialPrompt(envVar)}</p>
        <Input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={envVar}
          className="font-mono"
        />
        <Button
          className="w-full"
          disabled={!value.trim()}
          onClick={() => {
            resolveSecret(requestId, value)
            setValue('')
          }}
        >
          {t.approvals.submit}
        </Button>
      </div>
    </ResponsiveSheet>
  )
}

function toggleBatchChoices(encoded: string | undefined, choice: string): string[] {
  let choices: string[] = []

  if (encoded) {
    try {
      const parsed: unknown = JSON.parse(encoded)
      if (Array.isArray(parsed)) choices = parsed.filter((value): value is string => typeof value === 'string')
    } catch {
      // A legacy scalar answer is replaced by the first selected option.
    }
  }

  return choices.includes(choice) ? choices.filter(value => value !== choice) : [...choices, choice]
}

function isBatchChoiceSelected(encoded: string | undefined, choice: string, multiSelect = false): boolean {
  if (!multiSelect) return encoded === choice
  try {
    const parsed: unknown = encoded ? JSON.parse(encoded) : []
    return Array.isArray(parsed) && parsed.includes(choice)
  } catch {
    return false
  }
}
