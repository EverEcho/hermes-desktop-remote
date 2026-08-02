import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $connectionState, reconnectGateway } from '@/gateway'
import { $pendingApprovals, $pendingClarifications, $pendingSecrets, resolveApproval, resolveClarification, resolveSecret } from '@/gateway'
import { $sessions, $sessionsLoading, $activeSessionId, $currentCwd, refreshSessions, openSession, closeSession, createNewSession } from '@/sessions/store'
import { logout } from '@/auth'
import { Drawer } from '@/ui/Drawer'
import { BottomSheet } from '@/ui/BottomSheet'
import { cn } from '@/ui/utils'
import { SessionDetail } from '@/sessions/SessionDetail'
import { SessionList } from '@/sessions/SessionList'
import { MobileHeader } from '@/components/MobileHeader'
import { MobileSettingsModal } from '@/components/MobileSettingsModal'
import { WorkspaceSheet } from '@/workspace/WorkspaceSheet'
import { SkillsPage } from '@/features/SkillsPage'
import { CronPage } from '@/features/CronPage'
import { MessagingPage } from '@/features/MessagingPage'

export function AppShell() {
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
  const pendingApprovals = useStore($pendingApprovals)
  const pendingClarifications = useStore($pendingClarifications)
  const pendingSecrets = useStore($pendingSecrets)

  useEffect(() => {
    void refreshSessions()
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

  return (
    <div className="h-full flex flex-col bg-neutral-950">
      <MobileHeader
        onMenuPress={() => setDrawerOpen(true)}
        onSettingsPress={() => setSettingsOpen(true)}
        connectionState={connectionState}
        onRetry={handleRetry}
        title={activeSessionId ? undefined : 'RHermes'}
        onBack={activeSessionId ? handleBack : undefined}
        onWorkspacePress={activeSessionId ? () => setWorkspaceOpen(true) : undefined}
      />

      <div className="flex-1 overflow-hidden">
        {activeSessionId ? (
          <SessionDetail sessionId={activeSessionId} />
        ) : (
          <SessionList
            sessions={sessions}
            loading={sessionsLoading}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
            onRefresh={() => void refreshSessions()}
          />
        )}
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div className="flex-1 overflow-hidden">
          <SessionList
            sessions={sessions}
            loading={sessionsLoading}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
            onRefresh={() => void refreshSessions()}
            inDrawer
          />
        </div>
        <div className="p-4 border-t border-neutral-800 space-y-1">
          <DrawerButton label="Workspace" onClick={() => { setDrawerOpen(false); setWorkspaceOpen(true) }} />
          <DrawerButton label="Skills" onClick={() => { setDrawerOpen(false); setSkillsOpen(true) }} />
          <DrawerButton label="Cron Jobs" onClick={() => { setDrawerOpen(false); setCronOpen(true) }} />
          <DrawerButton label="Messaging" onClick={() => { setDrawerOpen(false); setMessagingOpen(true) }} />
          <DrawerButton label="Settings" onClick={() => { setDrawerOpen(false); setSettingsOpen(true) }} />
          <button
            className="w-full text-left text-sm text-red-400 py-2"
            onClick={() => void logout()}
          >
            Sign Out
          </button>
        </div>
      </Drawer>

      <MobileSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorkspaceSheet open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} cwd={currentCwd || undefined} />
      <SkillsPage open={skillsOpen} onClose={() => setSkillsOpen(false)} />
      <CronPage open={cronOpen} onClose={() => setCronOpen(false)} />
      <MessagingPage open={messagingOpen} onClose={() => setMessagingOpen(false)} />

      {pendingApprovals.length > 0 && (
        <ApprovalSheet
          requestId={pendingApprovals[0].requestId}
          command={pendingApprovals[0].command}
          description={pendingApprovals[0].description}
        />
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
  )
}

function DrawerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="w-full text-left text-(--conversation-text-font-size) text-(--ui-text-secondary) py-2 rounded-md px-1 active:bg-(--ui-row-active-background)"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function ApprovalSheet({ requestId, command, description }: { requestId: string; command?: string; description?: string }) {
  return (
    <BottomSheet open onClose={() => {}} title="Approval required">
      <div className="space-y-3 py-1">
        {description && <p className="text-(--conversation-text-font-size) text-(--ui-text-secondary)">{description}</p>}
        {command && (
          <pre className="text-(--conversation-tool-font-size) font-mono bg-(--ui-widget-surface-background) rounded-lg p-3 overflow-x-auto text-(--ui-text-secondary) select-text">
            {command}
          </pre>
        )}
        <div className="flex gap-2 pt-1">
          <button
            className="flex-1 py-2.5 rounded-lg bg-(--ui-green) text-white font-medium text-(--conversation-text-font-size) active:opacity-85"
            onClick={() => resolveApproval(requestId, true)}
          >
            Approve
          </button>
          <button
            className="flex-1 py-2.5 rounded-lg bg-(--ui-bg-quaternary) text-(--ui-text-secondary) font-medium text-(--conversation-text-font-size) active:bg-(--ui-row-active-background)"
            onClick={() => resolveApproval(requestId, false)}
          >
            Deny
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

function ClarifySheet({ requestId, question, choices }: { requestId: string; question: string; choices?: string[] }) {
  const [answer, setAnswer] = useState('')

  return (
    <BottomSheet open onClose={() => {}} title="Input needed">
      <div className="space-y-3 py-1">
        <p className="text-(--conversation-text-font-size) text-(--ui-text-primary)">{question}</p>

        {choices && choices.length > 0 ? (
          <div className="space-y-1.5">
            {choices.map(choice => (
              <button
                key={choice}
                className="w-full text-left px-3.5 py-2.5 rounded-lg bg-(--ui-widget-surface-background) text-(--conversation-text-font-size) text-(--ui-text-secondary) active:bg-(--ui-row-active-background)"
                onClick={() => resolveClarification(requestId, choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        ) : (
          <>
            <input
              type="text"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Type your answer…"
              className="w-full rounded-lg bg-(--ui-bg-card) border border-(--ui-stroke-secondary) px-3.5 py-2.5 text-(--conversation-text-font-size) text-(--ui-text-primary) placeholder:text-(--ui-text-quaternary) focus:outline-none focus:border-(--ui-accent)"
            />
            <button
              disabled={!answer.trim()}
              className="w-full py-2.5 rounded-lg bg-(--theme-primary) text-white font-medium text-(--conversation-text-font-size) disabled:opacity-40 active:opacity-85"
              onClick={() => resolveClarification(requestId, answer.trim())}
            >
              Submit
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}

function SecretSheet({ requestId, envVar, prompt }: { requestId: string; envVar: string; prompt?: string }) {
  const [value, setValue] = useState('')

  return (
    <BottomSheet open onClose={() => {}} title="Credential required">
      <div className="space-y-3 py-1">
        <p className="text-(--conversation-text-font-size) text-(--ui-text-secondary)">{prompt ?? `Enter value for ${envVar}`}</p>
        <input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={envVar}
          className="w-full rounded-lg bg-(--ui-bg-card) border border-(--ui-stroke-secondary) px-3.5 py-2.5 text-(--conversation-text-font-size) text-(--ui-text-primary) placeholder:text-(--ui-text-quaternary) font-mono focus:outline-none focus:border-(--ui-accent)"
        />
        <button
          disabled={!value.trim()}
          className="w-full py-2.5 rounded-lg bg-(--theme-primary) text-white font-medium text-(--conversation-text-font-size) disabled:opacity-40 active:opacity-85"
          onClick={() => {
            resolveSecret(requestId, value)
            setValue('')
          }}
        >
          Submit
        </button>
      </div>
    </BottomSheet>
  )
}
