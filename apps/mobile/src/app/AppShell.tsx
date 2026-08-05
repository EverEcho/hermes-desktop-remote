import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $connectionState, reconnectGateway } from '@/gateway'
import { $pendingApprovals, $pendingClarifications, $pendingSecrets, $pendingSudo, onGatewayEvent, resolveApproval, resolveClarification, resolveSecret, resolveSudo } from '@/gateway'
import { $sessions, $sessionsLoading, $activeSessionId, $currentCwd, $sessionTitle, refreshSessions, openSession, closeSession, createNewSession } from '@/sessions/store'
import { logout } from '@/auth'
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
import { useI18n } from '@/i18n'
import { Sidebar } from './Sidebar'
import { NewSessionHome } from './NewSessionHome'

export function AppShell({ onChangeGateway }: { onChangeGateway: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [cronOpen, setCronOpen] = useState(false)
  const [messagingOpen, setMessagingOpen] = useState(false)
  const connectionState = useStore($connectionState)
  const sessions = useStore($sessions)
  const sessionsLoading = useStore($sessionsLoading)
  const activeSessionId = useStore($activeSessionId)
  const currentCwd = useStore($currentCwd)
  const sessionTitle = useStore($sessionTitle)
  const pendingApprovals = useStore($pendingApprovals)
  const pendingClarifications = useStore($pendingClarifications)
  const pendingSecrets = useStore($pendingSecrets)
  const pendingSudo = useStore($pendingSudo)

  useEffect(() => {
    void refreshSessions()
  }, [])

  /* Live session-list sync (Desktop live-sync parity). session.reclaimed moves
   * the row's ended_at without a sessions.changed broadcast. */
  useEffect(() => {
    return onGatewayEvent(event => {
      if (event.type === 'sessions.changed' || event.type === 'session.reclaimed') {
        void refreshSessions()
      }
    })
  }, [])

  const handleSelectSession = useCallback((id: string) => {
    setDrawerOpen(false)
    void openSession(id)
  }, [])

  const handleNewSession = useCallback(async () => {
    setDrawerOpen(false)
    await createNewSession()
  }, [])

  const handleBack = useCallback(() => {
    closeSession()
  }, [])

  const handleRetry = useCallback(() => {
    void reconnectGateway()
  }, [])

  const handleFeature = useCallback(
    (feature: 'skills' | 'messaging' | 'workspace' | 'cron' | 'settings' | 'gateway' | 'logout') => {
      setDrawerOpen(false)
      if (feature === 'skills') setSkillsOpen(true)
      if (feature === 'messaging') setMessagingOpen(true)
      if (feature === 'workspace') setWorkspaceOpen(true)
      if (feature === 'cron') setCronOpen(true)
      if (feature === 'settings') setSettingsOpen(true)
      if (feature === 'gateway') onChangeGateway()
      if (feature === 'logout') void logout()
    },
    [onChangeGateway]
  )

  return (
    <div className="h-full flex bg-(--ui-bg-chrome)">
      {/* Desktop Sidebar (hidden on mobile) */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          sessions={sessions}
          loading={sessionsLoading}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
          onRefresh={() => void refreshSessions()}
          onFeature={handleFeature}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader
          onMenuPress={() => setDrawerOpen(true)}
          onSettingsPress={() => setSettingsOpen(true)}
          connectionState={connectionState}
          onRetry={handleRetry}
          title={activeSessionId ? sessionTitle ?? undefined : 'RHermes'}
          subtitle={activeSessionId && currentCwd ? currentCwd.split('/').pop() : undefined}
          onBack={activeSessionId ? handleBack : undefined}
          onWorkspacePress={activeSessionId ? () => setWorkspaceOpen(true) : undefined}
        />

        <div className="flex-1 overflow-hidden">
          {activeSessionId ? (
            <SessionDetail sessionId={activeSessionId} />
          ) : (
            <NewSessionHome />
          )}
        </div>

        {/* Mobile Drawer (uses identical unified Sidebar component) */}
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <Sidebar
            sessions={sessions}
            loading={sessionsLoading}
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
            onRefresh={() => void refreshSessions()}
            onFeature={handleFeature}
            inDrawer
          />
        </Drawer>

      <SettingsPage open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorkspaceSheet open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} cwd={currentCwd || undefined} />
      <SkillsPage open={skillsOpen} onClose={() => setSkillsOpen(false)} />
      <CronPage open={cronOpen} onClose={() => setCronOpen(false)} />
      <MessagingPage open={messagingOpen} onClose={() => setMessagingOpen(false)} />

      {pendingApprovals.length > 0 && (
        <ApprovalSheet
          requestId={pendingApprovals[0].requestId}
          command={pendingApprovals[0].command}
          description={pendingApprovals[0].description}
          allowPermanent={pendingApprovals[0].allowPermanent}
        />
      )}

      {pendingSudo.length > 0 && (
        <SudoSheet requestId={pendingSudo[0].requestId} />
      )}

      {pendingClarifications.length > 0 && (
        <ClarifySheet
          requestId={pendingClarifications[0].requestId}
          question={pendingClarifications[0].question}
          choices={pendingClarifications[0].choices}
        />
      )}

      {pendingSecrets.length > 0 && (
        <SecretSheet
          requestId={pendingSecrets[0].requestId}
          envVar={pendingSecrets[0].envVar}
          prompt={pendingSecrets[0].prompt}
        />
      )}
      </div>
    </div>
  )
}

function ApprovalSheet({ requestId, command, description, allowPermanent }: { requestId: string; command?: string; description?: string; allowPermanent?: boolean }) {
  const { t } = useI18n()

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
        {allowPermanent && (
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

function ClarifySheet({ requestId, question, choices }: { requestId: string; question: string; choices?: string[] }) {
  const { t } = useI18n()
  const [answer, setAnswer] = useState('')

  return (
    <ResponsiveSheet compact open onClose={() => {}} title={t.approvals.inputNeeded}>
      <div className="space-y-3">
        <p className="text-xs text-(--ui-text-primary)">{question}</p>

        {choices && choices.length > 0 ? (
          <div className="space-y-1">
            {choices.map(choice => (
              <Button
                key={choice}
                variant="secondary"
                className="w-full justify-start"
                onClick={() => resolveClarification(requestId, choice)}
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
              onClick={() => resolveClarification(requestId, answer.trim())}
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
