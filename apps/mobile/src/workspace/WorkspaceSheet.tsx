import { useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { FsListEntry, GitStatusResponse } from '@/types/hermes'
import { BottomSheet } from '@/ui/BottomSheet'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface WorkspaceSheetProps {
  open: boolean
  onClose: () => void
  cwd?: string
}

type Tab = 'files' | 'changes'

export function WorkspaceSheet({ open, onClose, cwd }: WorkspaceSheetProps) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('files')
  const [entries, setEntries] = useState<FsListEntry[]>([])
  const [currentPath, setCurrentPath] = useState(cwd ?? '')
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null)
  const [gitWorking, setGitWorking] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [gitError, setGitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    if (cwd) {
      setCurrentPath(cwd)
    }
  }, [open, cwd])

  useEffect(() => {
    if (!open || !currentPath) {
      return
    }

    setLoading(true)
    api
      .fsList(currentPath)
      .then(result => setEntries(result.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))

    api
      .gitStatus(currentPath)
      .then(setGitStatus)
      .catch(() => setGitStatus(null))
  }, [open, currentPath])

  const navigateTo = (path: string) => {
    setFileContent(null)
    setCurrentPath(path)
  }

  const openFile = async (entry: FsListEntry) => {
    if (entry.is_dir) {
      navigateTo(entry.path)

      return
    }

    try {
      const result = await api.fsReadText(entry.path)
      setFileContent({ path: entry.path, content: result.content })
    } catch {
      // best effort
    }
  }

  const parentPath = currentPath.replace(/\/[^/]+\/?$/, '') || '/'

  const refreshGitStatus = async () => {
    try {
      setGitStatus(await api.gitStatus(currentPath))
    } catch {
      setGitStatus(null)
    }
  }

  const updateStage = async (file: string, staged: boolean) => {
    setGitWorking(file)
    setGitError(null)
    try {
      if (staged) {
        await api.gitUnstage(file, currentPath)
      } else {
        await api.gitStage(file, currentPath)
      }
      await refreshGitStatus()
    } catch {
      setGitError(t.workspace.stageFailed(file, staged))
    } finally {
      setGitWorking(null)
    }
  }

  const commit = async () => {
    if (!commitMessage.trim()) return
    setGitWorking('commit')
    setGitError(null)
    try {
      await api.gitCommit(commitMessage.trim(), currentPath)
      setCommitMessage('')
      await refreshGitStatus()
    } catch {
      setGitError(t.workspace.commitFailed)
    } finally {
      setGitWorking(null)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t.workspace.title} fullScreen>
      <div className="flex gap-px mb-3 rounded-lg bg-(--ui-bg-quaternary) p-0.5">
        {(['files', 'changes'] as Tab[]).map(tabId => (
          <button
            key={tabId}
            className={cn(
              'flex-1 py-1.5 rounded-md text-(--conversation-caption-font-size) font-medium transition-colors',
              tab === tabId
                ? 'bg-(--ui-bg-card) text-(--ui-text-primary) shadow-sm'
                : 'text-(--ui-text-tertiary)'
            )}
            onClick={() => setTab(tabId)}
          >
            {tabId === 'files' ? t.workspace.files : t.workspace.changes}
          </button>
        ))}
      </div>

      {tab === 'files' && (
        <div>
          {fileContent ? (
            <div>
              <button
                className="text-(--conversation-caption-font-size) text-(--ui-accent) mb-2"
                onClick={() => setFileContent(null)}
              >
                {t.workspace.back}
              </button>
              <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary) mb-2 font-mono truncate">
                {fileContent.path}
              </p>
              <pre className="text-(--conversation-tool-font-size) font-mono text-(--ui-text-secondary) bg-(--ui-widget-surface-background) rounded-lg p-3 overflow-x-auto whitespace-pre-wrap select-text">
                {fileContent.content}
              </pre>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-1">
                {currentPath !== '/' && (
                  <button
                    className="text-(--conversation-caption-font-size) text-(--ui-accent) shrink-0"
                    onClick={() => navigateTo(parentPath)}
                  >
                    {t.workspace.up}
                  </button>
                )}
                <span className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary) font-mono truncate flex-1">
                  {currentPath}
                </span>
              </div>

              {loading && (
                <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">{t.common.loading}</p>
              )}

              <div>
                {entries.map(entry => (
                  <button
                    key={entry.path}
                    className="w-full flex items-center gap-2.5 px-2 py-2 min-h-[2.25rem] rounded-md active:bg-(--ui-row-active-background) text-left"
                    onClick={() => void openFile(entry)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={cn('shrink-0', entry.is_dir ? 'text-(--ui-accent)' : 'text-(--ui-text-tertiary)')}
                    >
                      {entry.is_dir ? (
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      ) : (
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />
                      )}
                    </svg>
                    <span className="text-(--conversation-text-font-size) text-(--ui-text-secondary) truncate">
                      {entry.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'changes' && (
        <div>
          {!gitStatus && (
            <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">
              {t.workspace.noRepo}
            </p>
          )}

          {gitStatus && (
            <div className="space-y-3">
              <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary)">
                {t.workspace.branch} <span className="font-mono text-(--ui-text-secondary)">{gitStatus.branch}</span>
              </p>

              {gitStatus.staged.length > 0 && (
                <div>
                  <ChangeLabel label={t.workspace.staged} color="text-(--ui-green)" />
                  {gitStatus.staged.map(f => <GitFileRow key={f} file={f} action={t.workspace.unstage} disabled={gitWorking !== null} onAction={() => void updateStage(f, true)} />)}
                </div>
              )}

              {gitStatus.modified.length > 0 && (
                <div>
                  <ChangeLabel label={t.workspace.modified} color="text-(--ui-yellow)" />
                  {gitStatus.modified.map(f => <GitFileRow key={f} file={f} action={t.workspace.stage} disabled={gitWorking !== null} onAction={() => void updateStage(f, false)} />)}
                </div>
              )}

              {gitStatus.untracked.length > 0 && (
                <div>
                  <ChangeLabel label={t.workspace.untracked} color="text-(--ui-text-tertiary)" />
                  {gitStatus.untracked.map(f => <GitFileRow key={f} file={f} action={t.workspace.stage} disabled={gitWorking !== null} onAction={() => void updateStage(f, false)} />)}
                </div>
              )}

              {gitStatus.staged.length > 0 && (
                <div className="border-t border-(--ui-stroke-tertiary) pt-3">
                  <label className="mb-1 block text-(--conversation-tool-font-size) text-(--ui-text-secondary)">{t.workspace.commitMessage}</label>
                  <div className="flex gap-2"><input value={commitMessage} onChange={event => setCommitMessage(event.target.value)} placeholder={t.workspace.commitPlaceholder} className="min-w-0 flex-1 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2 py-1.5 text-(--conversation-tool-font-size) text-(--ui-text-primary) outline-none focus:border-(--ui-accent)" /><button disabled={!commitMessage.trim() || gitWorking !== null} onClick={() => void commit()} className="rounded-md bg-(--ui-accent) px-3 py-1.5 text-(--conversation-tool-font-size) text-white disabled:opacity-50">{t.workspace.commit}</button></div>
                </div>
              )}

              {gitError && <p className="text-(--conversation-tool-font-size) text-(--ui-red)">{gitError}</p>}

              {gitStatus.staged.length === 0 &&
                gitStatus.modified.length === 0 &&
                gitStatus.untracked.length === 0 && (
                  <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary)">
                    {t.workspace.clean}
                  </p>
                )}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

function GitFileRow({ file, action, disabled, onAction }: { file: string; action: string; disabled: boolean; onAction: () => void }) {
  return <div className="flex items-center gap-2 py-1"><p className="min-w-0 flex-1 truncate font-mono text-(--conversation-tool-font-size) text-(--ui-text-secondary)">{file}</p><button disabled={disabled} onClick={onAction} className="shrink-0 text-(--conversation-tool-font-size) text-(--ui-accent) disabled:opacity-50">{action}</button></div>
}

function ChangeLabel({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 pb-0.5 pt-1">
      <span className={cn('shrink-0 text-[0.64rem] font-semibold uppercase tracking-[0.12em]', color)}>
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-(--ui-stroke-tertiary)" />
    </div>
  )
}
