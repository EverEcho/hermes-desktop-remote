import { useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { FsListEntry, GitStatusResponse } from '@/types/hermes'
import { BottomSheet } from '@/ui/BottomSheet'
import { cn } from '@/ui/utils'

interface WorkspaceSheetProps {
  open: boolean
  onClose: () => void
  cwd?: string
}

type Tab = 'files' | 'changes'

export function WorkspaceSheet({ open, onClose, cwd }: WorkspaceSheetProps) {
  const [tab, setTab] = useState<Tab>('files')
  const [entries, setEntries] = useState<FsListEntry[]>([])
  const [currentPath, setCurrentPath] = useState(cwd ?? '')
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null)

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

  return (
    <BottomSheet open={open} onClose={onClose} title="Workspace" fullScreen>
      <div className="flex gap-px mb-3 rounded-lg bg-(--ui-bg-quaternary) p-0.5">
        {(['files', 'changes'] as Tab[]).map(t => (
          <button
            key={t}
            className={cn(
              'flex-1 py-1.5 rounded-md text-(--conversation-caption-font-size) font-medium transition-colors',
              tab === t
                ? 'bg-(--ui-bg-card) text-(--ui-text-primary) shadow-sm'
                : 'text-(--ui-text-tertiary)'
            )}
            onClick={() => setTab(t)}
          >
            {t === 'files' ? 'Files' : 'Changes'}
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
                ← Back
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
                    ← Up
                  </button>
                )}
                <span className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary) font-mono truncate flex-1">
                  {currentPath}
                </span>
              </div>

              {loading && (
                <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">Loading…</p>
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
              No git repository
            </p>
          )}

          {gitStatus && (
            <div className="space-y-3">
              <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary)">
                Branch <span className="font-mono text-(--ui-text-secondary)">{gitStatus.branch}</span>
              </p>

              {gitStatus.staged.length > 0 && (
                <div>
                  <ChangeLabel label="Staged" color="text-(--ui-green)" />
                  {gitStatus.staged.map(f => (
                    <p key={f} className="text-(--conversation-tool-font-size) text-(--ui-text-secondary) font-mono py-0.5 truncate">
                      {f}
                    </p>
                  ))}
                </div>
              )}

              {gitStatus.modified.length > 0 && (
                <div>
                  <ChangeLabel label="Modified" color="text-(--ui-yellow)" />
                  {gitStatus.modified.map(f => (
                    <p key={f} className="text-(--conversation-tool-font-size) text-(--ui-text-secondary) font-mono py-0.5 truncate">
                      {f}
                    </p>
                  ))}
                </div>
              )}

              {gitStatus.untracked.length > 0 && (
                <div>
                  <ChangeLabel label="Untracked" color="text-(--ui-text-tertiary)" />
                  {gitStatus.untracked.map(f => (
                    <p key={f} className="text-(--conversation-tool-font-size) text-(--ui-text-secondary) font-mono py-0.5 truncate">
                      {f}
                    </p>
                  ))}
                </div>
              )}

              {gitStatus.staged.length === 0 &&
                gitStatus.modified.length === 0 &&
                gitStatus.untracked.length === 0 && (
                  <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary)">
                    Working tree clean
                  </p>
                )}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  )
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
