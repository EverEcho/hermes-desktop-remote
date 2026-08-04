import { useCallback, useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import { useI18n } from '@/i18n'
import type { SessionInfo } from '@/types/hermes'
import { ActionSheet } from '@/ui/ActionSheet'
import { Button } from '@/ui/Button'

import { ArchiveIcon } from '../icons'
import { Caption, Row, SectionHeading } from '../ui'

export function SessionsPage() {
  const { t } = useI18n()
  const s = t.settings.sessions
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<SessionInfo | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await api.listSessions(100, 'only')

      setSessions(result.sessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : s.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [s.loadFailed])

  useEffect(() => {
    void load()
  }, [load])

  const unarchive = async (session: SessionInfo) => {
    setBusy(true)

    try {
      await api.setSessionArchived(session.id, false)
      setSessions(prev => prev.filter(row => row.id !== session.id))
    } catch {
      setError(s.unarchiveFailed)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (session: SessionInfo) => {
    setBusy(true)

    try {
      await api.deleteSession(session.id)
      setSessions(prev => prev.filter(row => row.id !== session.id))
    } catch {
      setError(s.deleteFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <SectionHeading icon={ArchiveIcon} title={t.settings.nav.archivedChats} />
      <Caption className="mb-2">{s.emptyDesc}</Caption>

      {loading && <Caption className="py-6 text-center">{t.common.loading}</Caption>}
      {error && <Caption className="py-2 text-(--ui-red)">{error}</Caption>}
      {!loading && !error && sessions.length === 0 && <Caption className="py-6 text-center">{s.emptyTitle}</Caption>}

      {!loading &&
        sessions.map(session => (
          <Row
            action={
              <div className="flex shrink-0 items-center gap-1">
                <Button disabled={busy} onClick={() => void unarchive(session)} size="sm" variant="text">
                  {s.unarchive}
                </Button>
                <Button disabled={busy} onClick={() => setConfirmTarget(session)} size="sm" variant="text" className="text-(--ui-red)">
                  {t.common.delete}
                </Button>
              </div>
            }
            description={s.messages(session.message_count)}
            key={session.id}
            title={session.title || session.preview || t.sidebar.untitled}
          />
        ))}

      <ActionSheet
        actions={[{ destructive: true, id: 'delete', label: s.deletePermanently }]}
        onAction={id => {
          if (id === 'delete' && confirmTarget) {
            void remove(confirmTarget)
          }
        }}
        onClose={() => setConfirmTarget(null)}
        open={confirmTarget !== null}
        title={confirmTarget ? s.deleteConfirm(confirmTarget.title || t.sidebar.untitled) : undefined}
      />
    </div>
  )
}
