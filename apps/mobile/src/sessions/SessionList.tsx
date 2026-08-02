import { useCallback, useRef, useState } from 'react'

import type { SessionInfo } from '@/types/hermes'
import { ActionSheet, type ActionSheetAction } from '@/ui/ActionSheet'
import { MobileListRow } from '@/ui/primitives'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/utils'
import * as api from '@/gateway/api'

interface SessionListProps {
  sessions: SessionInfo[]
  loading: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onRefresh: () => void
  inDrawer?: boolean
}

export function SessionList({ sessions, loading, onSelect, onNew, onRefresh, inDrawer }: SessionListProps) {
  const [actionTarget, setActionTarget] = useState<SessionInfo | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SessionInfo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = searchQuery
    ? sessions.filter(
        s =>
          s.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.preview?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions

  const pinned = filtered.filter(s => s.pinned)
  const unpinned = filtered.filter(s => !s.pinned)

  const handleLongPress = useCallback((session: SessionInfo) => {
    setActionTarget(session)
  }, [])

  const handleAction = useCallback(
    async (actionId: string) => {
      if (!actionTarget) {
        return
      }

      const id = actionTarget._lineage_root_id ?? actionTarget.id

      switch (actionId) {
        case 'pin':
          try {
            await api.setSessionPinned(id, !actionTarget.pinned)
            onRefresh()
          } catch { /* best effort */ }
          break
        case 'archive':
          try {
            await api.setSessionArchived(id, true)
            onRefresh()
          } catch { /* best effort */ }
          break
        case 'delete':
          setConfirmDelete(actionTarget)
          break
      }
    },
    [actionTarget, onRefresh]
  )

  const confirmDeleteAction = useCallback(
    async (confirmed: boolean) => {
      if (confirmed && confirmDelete) {
        const id = confirmDelete._lineage_root_id ?? confirmDelete.id
        try {
          await api.deleteSession(id)
          onRefresh()
        } catch { /* best effort */ }
      }
      setConfirmDelete(null)
    },
    [confirmDelete, onRefresh]
  )

  const actions: ActionSheetAction[] = actionTarget
    ? [
        { id: 'pin', label: actionTarget.pinned ? 'Unpin' : 'Pin' },
        { id: 'archive', label: 'Archive' },
        { id: 'delete', label: 'Delete', destructive: true }
      ]
    : []

  return (
    <div className={cn('h-full flex flex-col', inDrawer && 'pt-1')}>
      <div className="px-2 py-1.5 flex items-center gap-1.5 shrink-0">
        <div className="flex-1 flex items-center gap-1.5 rounded-[var(--btn-radius)] bg-(--ui-bg-quaternary) px-2 py-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-(--ui-text-quaternary) shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-(--ui-text-primary) placeholder:text-(--ui-text-quaternary) focus:outline-none min-w-0"
          />
        </div>
        <Button size="icon-sm" onClick={onNew} aria-label="New chat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-1">
        {loading && sessions.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary)">Loading…</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <span className="text-xs text-(--ui-text-tertiary)">
              {searchQuery ? 'No matching sessions' : 'No sessions yet'}
            </span>
          </div>
        )}

        {pinned.length > 0 && (
          <div className="mb-0.5">
            <SectionLabel label="Pinned" />
            {pinned.map(session => (
              <SessionRow key={session.id} session={session} onSelect={onSelect} onLongPress={handleLongPress} />
            ))}
          </div>
        )}

        {unpinned.length > 0 && pinned.length > 0 && <SectionLabel label="Recent" />}

        {unpinned.map(session => (
          <SessionRow key={session.id} session={session} onSelect={onSelect} onLongPress={handleLongPress} />
        ))}
      </div>

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
        title={`Delete "${confirmDelete?.title ?? 'Untitled'}"? This cannot be undone.`}
        actions={[{ id: 'confirm', label: 'Delete Permanently', destructive: true }]}
        onAction={id => void confirmDeleteAction(id === 'confirm')}
      />
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 pb-0.5 pt-2">
      <span className="shrink-0 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-(--ui-stroke-tertiary)" />
    </div>
  )
}

function SessionRow({
  session,
  onSelect,
  onLongPress
}: {
  session: SessionInfo
  onSelect: (id: string) => void
  onLongPress: (session: SessionInfo) => void
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

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

  const handleClick = () => {
    if (didLongPress.current) {
      didLongPress.current = false
      return
    }
    onSelect(session._lineage_root_id ?? session.id)
  }

  return (
    <MobileListRow
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      <SessionDot session={session} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="flex-1 text-[0.8125rem] leading-none text-(--ui-text-secondary) truncate">
            {session.title || session.preview || 'Untitled'}
          </span>
          <span className="text-[0.625rem] leading-none text-(--ui-text-tertiary) shrink-0">
            {formatAge(session.last_active)}
          </span>
        </div>
        {session.preview && session.title && (
          <p className="mt-0.5 text-[0.6875rem] leading-tight text-(--ui-text-quaternary) truncate">
            {session.preview}
          </p>
        )}
      </div>
    </MobileListRow>
  )
}

function SessionDot({ session }: { session: SessionInfo }) {
  if (session.is_active) {
    return (
      <span className="relative size-1.5 rounded-full bg-(--ui-accent) shrink-0">
        <span className="absolute inset-0 rounded-full bg-(--ui-accent) opacity-70 animate-ping" />
      </span>
    )
  }

  return <span className="size-1 rounded-full bg-(--ui-text-quaternary) opacity-80 shrink-0" />
}

function formatAge(epochSeconds: number): string {
  if (!epochSeconds) {
    return ''
  }

  const diffSeconds = Date.now() / 1000 - epochSeconds

  if (diffSeconds < 60) {
    return 'now'
  }

  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)}m`
  }

  if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)}h`
  }

  return `${Math.floor(diffSeconds / 86400)}d`
}
