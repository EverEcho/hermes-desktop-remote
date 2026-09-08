import { useCallback, useEffect, useMemo, useState } from 'react'

import * as api from '@/gateway/api'
import type { FsListEntry } from '@/types/hermes'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface DesktopWorkspacePanelProps {
  cwd: string
  onClose: () => void
  onOpenWorkspace: () => void
}

export function DesktopWorkspacePanel({ cwd, onClose, onOpenWorkspace }: DesktopWorkspacePanelProps) {
  const { t } = useI18n()
  const [refreshKey, setRefreshKey] = useState(0)
  const [file, setFile] = useState<{ path: string; content: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const rootName = useMemo(() => cwd.split('/').filter(Boolean).pop() || cwd, [cwd])

  useEffect(() => {
    setFile(null)
    setEditing(false)
    setSaveError(null)
  }, [cwd])

  const openFile = useCallback(async (entry: FsListEntry) => {
    try {
      const result = await api.fsReadText(entry.path)
      setFile({ path: entry.path, content: result.content })
      setEditing(false)
      setSaveError(null)
    } catch {
      setFile(null)
    }
  }, [])

  const saveFile = useCallback(async () => {
    if (!file || saving) return

    setSaving(true)
    setSaveError(null)
    try {
      await api.fsWriteText(file.path, file.content)
      setEditing(false)
      setRefreshKey(value => value + 1)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save file')
    } finally {
      setSaving(false)
    }
  }, [file, saving])

  return (
    <aside className="desktop-workspace-panel">
      <div className="desktop-workspace-header">
        <button className="desktop-workspace-root" onClick={onOpenWorkspace} title={cwd}>
          <Codicon name="root-folder-opened" className="text-(--ui-accent)" />
          <span className="truncate">{rootName}</span>
        </button>
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

      {file ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="desktop-file-preview-toolbar">
            <button className="desktop-file-preview-back" onClick={() => { setFile(null); setEditing(false) }}>
              <Codicon name="chevron-left" />
              <span className="truncate">{file.path.split('/').pop()}</span>
            </button>
            {editing ? (
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
            ) : (
              <button className="desktop-workspace-action" onClick={() => setEditing(true)} title="Edit file">
                <Codicon name="edit" />
              </button>
            )}
          </div>
          {editing ? (
            <textarea
              aria-label={`Edit ${file.path.split('/').pop()}`}
              className="desktop-file-editor"
              onChange={event => setFile(current => current ? { ...current, content: event.target.value } : current)}
              spellCheck={false}
              value={file.content}
            />
          ) : (
            <pre className="desktop-file-preview">{file.content}</pre>
          )}
          {saveError ? <div className="desktop-file-save-error">{saveError}</div> : null}
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
