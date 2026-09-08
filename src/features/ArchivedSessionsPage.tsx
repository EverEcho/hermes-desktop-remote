import { useCallback, useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { SessionInfo } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface ArchivedSessionsPageProps {
  onClose: () => void
  onOpenSession: (sessionId: string) => void
  open: boolean
}

export function ArchivedSessionsPage({ onClose, onOpenSession, open }: ArchivedSessionsPageProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setSessions((await api.listSessions(100, 'only')).sessions)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load archived sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (open) void refresh() }, [open, refresh])

  const restore = async (session: SessionInfo) => {
    setWorking(session.id)
    try {
      await api.setSessionArchived(session.id, false)
      setSessions(current => current.filter(item => item.id !== session.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to restore session')
    } finally {
      setWorking(null)
    }
  }

  const remove = async (session: SessionInfo) => {
    if (!window.confirm(`Permanently delete “${session.title || 'this session'}”?`)) return
    setWorking(session.id)
    try {
      await api.deleteSession(session.id)
      setSessions(current => current.filter(item => item.id !== session.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete session')
    } finally {
      setWorking(null)
    }
  }

  return (
    <ResponsiveSheet onClose={onClose} open={open} title="Archived sessions">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-(--ui-text-tertiary)">Archived sessions stay on the Gateway until restored or deleted.</p><Button disabled={loading} onClick={() => void refresh()} size="sm" variant="secondary">Refresh</Button></div>
        {error ? <div className="rounded-md bg-(--ui-red)/10 px-2.5 py-2 text-xs text-(--ui-red)">{error}</div> : null}
        {loading ? <div className="py-8 text-center text-xs text-(--ui-text-quaternary)">Loading archived sessions…</div> : null}
        {!loading && !sessions.length ? <div className="py-8 text-center text-xs text-(--ui-text-quaternary)">No archived sessions.</div> : null}
        <div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">
          {sessions.map(session => <ArchivedRow key={session.id} onDelete={remove} onOpen={onOpenSession} onRestore={restore} session={session} working={working === session.id} />)}
        </div>
      </div>
    </ResponsiveSheet>
  )
}

function ArchivedRow({ onDelete, onOpen, onRestore, session, working }: { onDelete: (session: SessionInfo) => void; onOpen: (sessionId: string) => void; onRestore: (session: SessionInfo) => void; session: SessionInfo; working: boolean }) {
  return <div className="border-b border-(--ui-stroke-tertiary) px-3 py-2.5 last:border-b-0"><button className="block w-full text-left" disabled={working} onClick={() => onOpen(session.id)} type="button"><span className="block truncate text-xs font-medium text-(--ui-text-primary)">{session.title || 'Untitled session'}</span><span className="mt-1 block truncate text-[0.68rem] text-(--ui-text-quaternary)">{session.preview || 'No preview'}</span></button><div className="mt-2 flex gap-3 text-[0.68rem]"><button className="text-(--ui-accent) disabled:opacity-40" disabled={working} onClick={() => onRestore(session)} type="button">Restore</button><button className="text-(--ui-red) disabled:opacity-40" disabled={working} onClick={() => onDelete(session)} type="button">Delete</button></div></div>
}
