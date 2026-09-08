import { useCallback, useEffect, useMemo, useState } from 'react'

import * as api from '@/gateway/api'
import type { FsListEntry, GitStatusResponse } from '@/types/hermes'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface DesktopWorkspacePanelProps {
  cwd: string
  externalPreview?: RemotePreviewTarget | null
  onClose: () => void
  onOpenWorkspace: () => void
  onOpenTerminal?: () => void
  onPreviewConsumed?: () => void
}

export interface RemotePreviewTarget {
  kind: 'file' | 'url' | 'diff'
  value: string
  label?: string
}

interface PreviewTab {
  id: string
  kind: RemotePreviewTarget['kind']
  label: string
  value: string
  content?: string
  dataUrl?: string
  error?: string
  loading?: boolean
}

function labelForTarget(target: RemotePreviewTarget) {
  if (target.label) return target.label
  try {
    return new URL(target.value).hostname || target.value
  } catch {
    return target.value.split('/').filter(Boolean).pop() || target.value
  }
}

function isMarkdown(path: string) {
  return /\.(?:md|mdx|markdown)$/i.test(path)
}

function isImage(path: string) {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(path)
}

function isPdf(path: string) {
  return /\.pdf(?:[?#].*)?$/i.test(path)
}

function needsDataUrl(path: string) {
  return isImage(path) || isPdf(path)
}

function normalizeGitStatus(raw: GitStatusResponse | null): GitStatusResponse | null {
  if (!raw) return null
  return {
    ...raw,
    staged: raw.staged ?? [],
    modified: raw.modified ?? [],
    untracked: raw.untracked ?? []
  }
}

/** A deliberately small Markdown reader. It never injects remote HTML into the
 * app WebView; raw HTML remains text while headings, lists and code are made
 * scannable. Full rendered Markdown is still available in the conversation. */
function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n')
  let code = false
  return <div className="desktop-markdown-preview">{lines.map((line, index) => {
    if (line.startsWith('```')) {
      code = !code
      return <div className="desktop-markdown-fence" key={`${index}:${line}`}>{line.slice(3) || 'code'}</div>
    }
    if (code) return <pre className="desktop-markdown-code" key={index}>{line}</pre>
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) return <div className={`desktop-markdown-heading h${heading[1].length}`} key={index}>{heading[2]}</div>
    const list = /^\s*[-*+]\s+(.+)$/.exec(line)
    if (list) return <div className="desktop-markdown-list" key={index}>• {list[1]}</div>
    if (!line.trim()) return <div className="desktop-markdown-gap" key={index} />
    return <p key={index}>{line}</p>
  })}</div>
}

function DiffPreview({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <pre className="desktop-file-preview font-mono text-[0.68rem] leading-relaxed p-3 overflow-auto select-text">
      {lines.map((line, idx) => {
        let colorClass = 'text-(--ui-text-secondary)'
        let bgClass = ''
        if (line.startsWith('+') && !line.startsWith('+++')) {
          colorClass = 'text-(--ui-green)'
          bgClass = 'bg-(--ui-green)/10'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          colorClass = 'text-(--ui-red)'
          bgClass = 'bg-(--ui-red)/10'
        } else if (line.startsWith('@')) {
          colorClass = 'text-(--ui-accent)'
        }
        return (
          <div key={idx} className={cn('px-1 rounded-xs', colorClass, bgClass)}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

export function DesktopWorkspacePanel({ cwd, externalPreview, onClose, onOpenWorkspace, onOpenTerminal, onPreviewConsumed }: DesktopWorkspacePanelProps) {
  const { t } = useI18n()
  const [refreshKey, setRefreshKey] = useState(0)
  const [tabs, setTabs] = useState<PreviewTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'tree' | 'changes' | 'preview'>('tree')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null)
  const [gitWorking, setGitWorking] = useState<string | null>(null)
  const [gitError, setGitError] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')

  const rootName = useMemo(() => cwd.split('/').filter(Boolean).pop() || cwd, [cwd])

  const refreshGit = useCallback(async () => {
    try {
      const res = await api.gitStatus(cwd)
      setGitStatus(normalizeGitStatus(res))
    } catch {
      setGitStatus(null)
    }
  }, [cwd])

  useEffect(() => {
    setTabs([])
    setActiveTabId(null)
    setViewMode('tree')
    setEditing(false)
    setSaveError(null)
    void refreshGit()
  }, [cwd, refreshGit])

  useEffect(() => {
    void refreshGit()
  }, [refreshKey, refreshGit])

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? null
  const file = activeTab?.kind === 'file' && activeTab.content !== undefined
    ? { path: activeTab.value, content: activeTab.content }
    : null

  const openPreview = useCallback(async (target: RemotePreviewTarget) => {
    const id = `${target.kind}:${target.value}`
    const existing = tabs.find(tab => tab.id === id)
    if (existing) {
      setActiveTabId(id)
      setViewMode('preview')
      return
    }
    const tab: PreviewTab = { id, kind: target.kind, label: labelForTarget(target), value: target.value, loading: target.kind !== 'url' }
    setTabs(current => [...current, tab])
    setActiveTabId(id)
    setViewMode('preview')
    setEditing(false)
    setSaveError(null)
    if (target.kind === 'url') return
    try {
      if (target.kind === 'diff') {
        const res = await api.gitFileDiff(target.value, cwd)
        setTabs(current => current.map(item => item.id === id ? { ...item, content: res.diff, loading: false } : item))
      } else if (needsDataUrl(target.value)) {
        const dataUrl = await api.fsReadDataUrl(target.value)
        setTabs(current => current.map(item => item.id === id ? { ...item, dataUrl, loading: false } : item))
      } else {
        const result = await api.fsReadText(target.value)
        setTabs(current => current.map(item => item.id === id ? { ...item, content: result.content, loading: false } : item))
      }
    } catch (error) {
      setTabs(current => current.map(item => item.id === id ? {
        ...item,
        error: error instanceof Error ? error.message : 'Unable to preview remote resource.',
        loading: false
      } : item))
    }
  }, [cwd, tabs])

  useEffect(() => {
    if (!externalPreview) return
    void openPreview(externalPreview)
    onPreviewConsumed?.()
  }, [externalPreview, onPreviewConsumed, openPreview])

  const openFile = useCallback((entry: FsListEntry) => {
    void openPreview({ kind: 'file', value: entry.path, label: entry.name })
  }, [openPreview])

  const openDiff = useCallback((filePath: string) => {
    void openPreview({ kind: 'diff', value: filePath, label: `Diff: ${filePath.split('/').pop() || filePath}` })
  }, [openPreview])

  const closeTab = useCallback((id: string) => {
    setTabs(current => {
      const index = current.findIndex(tab => tab.id === id)
      const remaining = current.filter(tab => tab.id !== id)
      if (activeTabId === id) {
        const nextId = remaining[index]?.id ?? remaining[index - 1]?.id ?? null
        setActiveTabId(nextId)
        if (!nextId) setViewMode('tree')
      }
      return remaining
    })
    setEditing(false)
  }, [activeTabId])

  const saveFile = useCallback(async () => {
    if (!file || saving) return

    setSaving(true)
    setSaveError(null)
    try {
      await api.fsWriteText(file.path, file.content)
      setTabs(current => current.map(tab => tab.id === activeTabId ? { ...tab, content: file.content } : tab))
      setEditing(false)
      setRefreshKey(value => value + 1)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save file')
    } finally {
      setSaving(false)
    }
  }, [activeTabId, file, saving])

  const stage = async (filePath: string) => {
    setGitWorking(`stage:${filePath}`)
    setGitError(null)
    try {
      await api.gitStage(filePath, cwd)
      await refreshGit()
    } catch (err) {
      setGitError(err instanceof Error ? err.message : 'Stage failed')
    } finally {
      setGitWorking(null)
    }
  }

  const unstage = async (filePath: string) => {
    setGitWorking(`unstage:${filePath}`)
    setGitError(null)
    try {
      await api.gitUnstage(filePath, cwd)
      await refreshGit()
    } catch (err) {
      setGitError(err instanceof Error ? err.message : 'Unstage failed')
    } finally {
      setGitWorking(null)
    }
  }

  const commit = async () => {
    if (!commitMessage.trim() || gitWorking) return
    setGitWorking('commit')
    setGitError(null)
    try {
      await api.gitCommit(commitMessage.trim(), cwd)
      setCommitMessage('')
      await refreshGit()
    } catch (err) {
      setGitError(err instanceof Error ? err.message : 'Commit failed')
    } finally {
      setGitWorking(null)
    }
  }

  const push = async () => {
    if (gitWorking) return
    setGitWorking('push')
    setGitError(null)
    try {
      await api.gitPush(cwd)
      await refreshGit()
    } catch (err) {
      setGitError(err instanceof Error ? err.message : 'Push failed')
    } finally {
      setGitWorking(null)
    }
  }

  const totalChanges = (gitStatus?.staged.length ?? 0) + (gitStatus?.modified.length ?? 0) + (gitStatus?.untracked.length ?? 0)

  return (
    <aside className="desktop-workspace-panel">
      <div className="desktop-workspace-header">
        <button className="desktop-workspace-root" onClick={onOpenWorkspace} title={cwd}>
          <Codicon name="root-folder-opened" className="text-(--ui-accent)" />
          <span className="truncate">{rootName}</span>
        </button>
        {onOpenTerminal ? (
          <button
            className="desktop-workspace-action"
            onClick={onOpenTerminal}
            title="Remote terminal"
          >
            <Codicon name="terminal" />
          </button>
        ) : null}
        <button
          className="desktop-workspace-action"
          onClick={() => setRefreshKey(value => value + 1)}
          title={t.desktop.refreshFiles}
        >
          <Codicon name="refresh" />
        </button>
        <button className="desktop-workspace-action" onClick={onClose} title={t.desktop.hideFileList}>
          <Codicon name="layout-sidebar-right-off" />
        </button>
      </div>

      <div className="desktop-preview-tabs" role="tablist">
        <button
          aria-selected={viewMode === 'tree'}
          className={cn('desktop-preview-tab desktop-preview-tab-tree', viewMode === 'tree' && 'is-active')}
          onClick={() => setViewMode('tree')}
          role="tab"
          title="File Tree"
          type="button"
        >
          <Codicon name="list-tree" />
          <span className="truncate">Files</span>
        </button>
        <button
          aria-selected={viewMode === 'changes'}
          className={cn('desktop-preview-tab desktop-preview-tab-tree', viewMode === 'changes' && 'is-active')}
          onClick={() => {
            setViewMode('changes')
            void refreshGit()
          }}
          role="tab"
          title="Git Review"
          type="button"
        >
          <Codicon name="git-branch" />
          <span className="truncate">Changes {totalChanges > 0 ? `(${totalChanges})` : ''}</span>
        </button>
        {tabs.map(tab => (
          <div className={cn('desktop-preview-tab', viewMode === 'preview' && activeTabId === tab.id && 'is-active')} key={tab.id} role="presentation">
            <button
              onClick={() => {
                setActiveTabId(tab.id)
                setViewMode('preview')
                setEditing(false)
              }}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
            <button aria-label={`Close ${tab.label}`} onClick={() => closeTab(tab.id)} type="button"><Codicon name="close" /></button>
          </div>
        ))}
      </div>

      {viewMode === 'preview' && activeTab ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="desktop-file-preview-toolbar">
            <span className="min-w-0 flex-1 truncate px-2 font-mono text-[0.63rem] text-(--ui-text-tertiary)" title={activeTab.value}>{activeTab.value}</span>
            {file && editing ? (
              <>
                <button
                  className="desktop-workspace-action"
                  disabled={saving}
                  onClick={() => { setEditing(false); setSaveError(null) }}
                  title="Discard file edits"
                >
                  <Codicon name="discard" />
                </button>
                <button className="desktop-workspace-action" disabled={saving} onClick={() => void saveFile()} title="Save file">
                  <Codicon name={saving ? 'loading' : 'save'} className={saving ? 'animate-spin' : undefined} />
                </button>
              </>
            ) : file ? (
              <button className="desktop-workspace-action" onClick={() => setEditing(true)} title="Edit file">
                <Codicon name="edit" />
              </button>
            ) : null}
          </div>
          {activeTab.kind === 'diff' && activeTab.content ? (
            <DiffPreview content={activeTab.content} />
          ) : activeTab.kind === 'url' && isImage(activeTab.value) ? (
            <div className="desktop-media-preview"><img alt={activeTab.label} src={activeTab.value} /></div>
          ) : activeTab.kind === 'url' && isPdf(activeTab.value) ? (
            <iframe className="desktop-url-preview" src={activeTab.value} title={activeTab.label} />
          ) : activeTab.kind === 'url' ? (
            <iframe className="desktop-url-preview" sandbox="allow-forms allow-popups allow-scripts" src={activeTab.value} title={activeTab.label} />
          ) : activeTab.loading ? (
            <div className="p-3 text-xs text-(--ui-text-quaternary)">{t.common.loading}</div>
          ) : activeTab.error ? (
            <div className="p-3 text-xs text-(--ui-red)">{activeTab.error}</div>
          ) : activeTab.dataUrl && isImage(activeTab.value) ? (
            <div className="desktop-media-preview"><img alt={activeTab.label} src={activeTab.dataUrl} /></div>
          ) : activeTab.dataUrl && isPdf(activeTab.value) ? (
            <iframe className="desktop-url-preview" src={activeTab.dataUrl} title={activeTab.label} />
          ) : editing && file ? (
            <textarea
              aria-label={`Edit ${file.path.split('/').pop()}`}
              className="desktop-file-editor"
              onChange={event => setTabs(current => current.map(tab => tab.id === activeTabId ? { ...tab, content: event.target.value } : tab))}
              spellCheck={false}
              value={file.content}
            />
          ) : file && isMarkdown(file.path) ? (
            <MarkdownPreview content={file.content} />
          ) : file ? (
            <pre className="desktop-file-preview">{file.content}</pre>
          ) : null}
          {saveError ? <div className="desktop-file-save-error">{saveError}</div> : null}
        </div>
      ) : viewMode === 'changes' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2 space-y-3 no-scrollbar text-xs">
          <div className="flex items-center justify-between border-b border-(--ui-stroke-tertiary) pb-2">
            <div className="flex items-center gap-1.5 font-mono text-xs text-(--ui-text-primary)">
              <Codicon name="git-branch" className="text-(--ui-accent)" />
              <span>{gitStatus?.branch || 'main'}</span>
            </div>
            <button
              className="rounded px-2 py-0.5 text-xs text-(--ui-accent) hover:bg-(--chrome-action-hover) disabled:opacity-40"
              disabled={gitWorking !== null}
              onClick={() => void push()}
              type="button"
            >
              {gitWorking === 'push' ? t.common.loading : 'Push'}
            </button>
          </div>

          {gitError && <div className="rounded bg-(--ui-red)/10 p-2 text-xs text-(--ui-red)">{gitError}</div>}

          {/* Staged Changes */}
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-(--ui-text-quaternary) mb-1">
              Staged Changes ({gitStatus?.staged.length ?? 0})
            </div>
            {gitStatus?.staged.map(f => (
              <div key={f} className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-(--chrome-action-hover) group">
                <button
                  className="min-w-0 flex-1 text-left truncate font-mono text-[0.68rem] text-(--ui-green)"
                  onClick={() => openDiff(f)}
                  type="button"
                >
                  {f}
                </button>
                <button
                  className="text-(--ui-text-quaternary) hover:text-(--ui-text-primary) px-1 text-xs"
                  disabled={gitWorking !== null}
                  onClick={() => void unstage(f)}
                  title="Unstage"
                  type="button"
                >
                  -
                </button>
              </div>
            ))}
          </div>

          {/* Modified Changes */}
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-(--ui-text-quaternary) mb-1">
              Changes ({gitStatus?.modified.length ?? 0})
            </div>
            {gitStatus?.modified.map(f => (
              <div key={f} className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-(--chrome-action-hover) group">
                <button
                  className="min-w-0 flex-1 text-left truncate font-mono text-[0.68rem] text-(--ui-text-primary)"
                  onClick={() => openDiff(f)}
                  type="button"
                >
                  {f}
                </button>
                <button
                  className="text-(--ui-text-quaternary) hover:text-(--ui-accent) px-1 text-xs"
                  disabled={gitWorking !== null}
                  onClick={() => void stage(f)}
                  title="Stage"
                  type="button"
                >
                  +
                </button>
              </div>
            ))}
          </div>

          {/* Untracked Files */}
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-(--ui-text-quaternary) mb-1">
              Untracked ({gitStatus?.untracked.length ?? 0})
            </div>
            {gitStatus?.untracked.map(f => (
              <div key={f} className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-(--chrome-action-hover) group">
                <button
                  className="min-w-0 flex-1 text-left truncate font-mono text-[0.68rem] text-(--ui-text-tertiary)"
                  onClick={() => void openPreview({ kind: 'file', value: f })}
                  type="button"
                >
                  {f}
                </button>
                <button
                  className="text-(--ui-text-quaternary) hover:text-(--ui-accent) px-1 text-xs"
                  disabled={gitWorking !== null}
                  onClick={() => void stage(f)}
                  title="Stage"
                  type="button"
                >
                  +
                </button>
              </div>
            ))}
          </div>

          {/* Commit Area */}
          {(gitStatus?.staged.length ?? 0) > 0 && (
            <div className="pt-2 border-t border-(--ui-stroke-tertiary) space-y-2">
              <input
                className="w-full rounded border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) px-2 py-1 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"
                onChange={e => setCommitMessage(e.target.value)}
                placeholder="Commit message…"
                value={commitMessage}
              />
              <button
                className="w-full rounded bg-(--ui-accent) py-1 text-xs font-medium text-white disabled:opacity-50"
                disabled={!commitMessage.trim() || gitWorking !== null}
                onClick={() => void commit()}
                type="button"
              >
                {gitWorking === 'commit' ? t.common.saving : 'Commit Staged'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1 no-scrollbar">
          <DirectoryChildren
            key={`${cwd}:${refreshKey}`}
            path={cwd}
            depth={0}
            onOpenFile={openFile}
            loadingLabel={t.common.loading}
          />
        </div>
      )}
    </aside>
  )
}

function DirectoryChildren({
  path,
  depth,
  onOpenFile,
  loadingLabel
}: {
  path: string
  depth: number
  onOpenFile: (entry: FsListEntry) => void
  loadingLabel: string
}) {
  const [entries, setEntries] = useState<FsListEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.fsList(path)
      .then(result => {
        if (!cancelled) {
          setEntries(
            [...(result.entries ?? [])].sort((a, b) =>
              a.is_dir === b.is_dir ? a.name.localeCompare(b.name) : a.is_dir ? -1 : 1
            )
          )
        }
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [path])

  if (loading) {
    return depth === 0 ? (
      <div className="px-2 py-3 text-xs text-(--ui-text-quaternary)">{loadingLabel}</div>
    ) : null
  }

  return (
    <>
      {entries.map(entry => (
        <FileTreeRow
          key={entry.path}
          entry={entry}
          depth={depth}
          onOpenFile={onOpenFile}
          loadingLabel={loadingLabel}
        />
      ))}
    </>
  )
}

function FileTreeRow({
  entry,
  depth,
  onOpenFile,
  loadingLabel
}: {
  entry: FsListEntry
  depth: number
  onOpenFile: (entry: FsListEntry) => void
  loadingLabel: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        className="desktop-file-row"
        style={{ paddingLeft: `${6 + depth * 14}px` }}
        onClick={() => entry.is_dir ? setExpanded(value => !value) : onOpenFile(entry)}
        title={entry.path}
      >
        {entry.is_dir ? (
          <Codicon name={expanded ? 'chevron-down' : 'chevron-right'} className="desktop-file-chevron" />
        ) : (
          <span className="desktop-file-chevron" />
        )}
        <Codicon
          name={entry.is_dir ? (expanded ? 'folder-opened' : 'folder') : 'file'}
          className={cn(entry.is_dir ? 'text-(--ui-text-tertiary)' : 'text-(--ui-text-quaternary)')}
        />
        <span className="truncate">{entry.name}</span>
      </button>
      {entry.is_dir && expanded ? (
        <DirectoryChildren
          path={entry.path}
          depth={depth + 1}
          onOpenFile={onOpenFile}
          loadingLabel={loadingLabel}
        />
      ) : null}
    </div>
  )
}
