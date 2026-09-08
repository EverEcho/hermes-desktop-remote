import { useEffect, useMemo, useRef, useState } from 'react'

import type { SessionInfo } from '@/types/hermes'
import * as api from '@/gateway/api'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'

interface DesktopSessionPickerProps {
  activeSessionId: string | null
  onClose: () => void
  onOpen: (id: string, profile?: string) => void
  open: boolean
  sessions: SessionInfo[]
}

/** A focused desktop session picker backed by the active remote Gateway's
 * session index. It does not own session data, so profile and connection
 * changes naturally replace its rows through the shared store. */
export function DesktopSessionPicker({ activeSessionId, onClose, onOpen, open, sessions }: DesktopSessionPickerProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [remoteMatches, setRemoteMatches] = useState<SessionInfo[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const localMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const indexed = normalized
      ? sessions.filter(session => `${session.title ?? ''} ${session.preview ?? ''} ${session.cwd ?? ''}`.toLowerCase().includes(normalized))
      : sessions

    return [...indexed].sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)))
  }, [query, sessions])

  useEffect(() => {
    const normalized = query.trim().toLowerCase()
    if (!open || normalized.length < 2) {
      setRemoteMatches(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void api.searchSessions(normalized).then(({ results }) => {
        if (cancelled) return
        const known = new Map(sessions.map(session => [session.id, session]))
        setRemoteMatches(results.map(result => known.get(result.id) ?? ({
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
      }).catch(() => { if (!cancelled) setRemoteMatches(null) })
    }, 180)

    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, query, sessions])

  const matches = remoteMatches ?? localMatches

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (selectedIndex >= matches.length) setSelectedIndex(Math.max(0, matches.length - 1))
  }, [matches.length, selectedIndex])

  if (!open) return null

  const choose = (session: SessionInfo | undefined) => {
    if (!session) return
    onClose()
    onOpen(session._lineage_root_id ?? session.id, session.profile)
  }

  return (
    <div
      aria-label="Session switcher"
      aria-modal="true"
      className="fixed inset-0 z-[91] flex items-start justify-center bg-black/15 pt-[15vh] backdrop-blur-[1px]"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
      role="dialog"
    >
      <div className="w-[min(38rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) shadow-(--shadow-nous)">
        <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2.5">
          <Codicon className="text-(--ui-text-quaternary)" name="comment-discussion" />
          <input
            aria-label="Search sessions"
            className="min-w-0 flex-1 bg-transparent text-sm text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
            onChange={event => { setQuery(event.target.value); setSelectedIndex(0) }}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedIndex(current => Math.min(current + 1, Math.max(0, matches.length - 1)))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex(current => Math.max(0, current - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                choose(matches[selectedIndex])
              }
            }}
            placeholder="Search conversations…"
            ref={inputRef}
            value={query}
          />
          <kbd className="rounded border border-(--ui-stroke-tertiary) px-1.5 py-0.5 text-[0.65rem] text-(--ui-text-quaternary)">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5 no-scrollbar">
          {matches.length ? matches.map((session, index) => {
            const id = session._lineage_root_id ?? session.id
            const title = session.title?.trim() || 'Untitled conversation'
            const meta = session.cwd?.split('/').filter(Boolean).pop() || session.preview || ''

            return (
              <button
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
                  index === selectedIndex
                    ? 'bg-(--ui-row-active-background) text-(--ui-text-primary)'
                    : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
                )}
                key={session.id}
                onClick={() => choose(session)}
                onMouseEnter={() => setSelectedIndex(index)}
                type="button"
              >
                <Codicon className={cn('text-sm', id === activeSessionId ? 'text-(--ui-accent)' : 'text-(--ui-text-quaternary)')} name={session.pinned ? 'pin' : 'comment-discussion'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{title}</span>
                  {meta ? <span className="block truncate pt-0.5 text-[0.68rem] text-(--ui-text-quaternary)">{meta}</span> : null}
                </span>
                {session.unread ? <span className="size-1.5 rounded-full bg-(--ui-accent)" /> : null}
              </button>
            )
          }) : (
            <div className="px-3 py-8 text-center text-xs text-(--ui-text-quaternary)">No matching conversations</div>
          )}
        </div>
      </div>
    </div>
  )
}
