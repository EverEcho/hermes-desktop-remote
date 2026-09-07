import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $connectionState, getGateway, reconnectGateway } from '@/gateway'
import { $pendingApprovals, $pendingClarifications, $pendingMcpSetup, $pendingSecrets, $pendingSudo, onGatewayEvent, resolveApproval, resolveClarification, resolveClarificationBatch, resolveMcpSetup, resolveSecret, resolveSudo, type ClarifyRequest, type McpSetupRequest } from '@/gateway'
import * as api from '@/gateway/api'
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
  const pendingMcpSetup = useStore($pendingMcpSetup)

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
      </div>
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
        if (flow.authorization_url) window.open(flow.authorization_url, '_blank', 'noopener,noreferrer')
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
