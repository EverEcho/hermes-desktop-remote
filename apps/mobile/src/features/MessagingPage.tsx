import { useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { PairingResponse } from '@/types/hermes'
import { BottomSheet } from '@/ui/BottomSheet'

interface MessagingPageProps {
  open: boolean
  onClose: () => void
}

export function MessagingPage({ open, onClose }: MessagingPageProps) {
  const [pairing, setPairing] = useState<PairingResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setLoading(true)
    api
      .getPairing()
      .then(setPairing)
      .catch(() => setPairing(null))
      .finally(() => setLoading(false))
  }, [open])

  const approveUser = async (platform: string, requestId: string) => {
    try {
      await api.approvePairing(platform, requestId)
      setPairing(prev => {
        if (!prev) {
          return prev
        }

        const user = prev.pending.find(u => u.request_id === requestId)

        if (!user) {
          return prev
        }

        return {
          pending: prev.pending.filter(u => u.request_id !== requestId),
          approved: [...prev.approved, user]
        }
      })
    } catch {
      // best effort
    }
  }

  const revokeUser = async (platform: string, userId: string) => {
    try {
      await api.revokePairing(platform, userId)
      setPairing(prev => {
        if (!prev) {
          return prev
        }

        return { ...prev, approved: prev.approved.filter(u => u.user_id !== userId) }
      })
    } catch {
      // best effort
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Messaging" fullScreen>
      {loading && (
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">Loading…</p>
      )}

      {pairing && pairing.pending.length > 0 && (
        <div className="mb-4">
          <SectionLabel label="Pending" />
          {pairing.pending.map(user => (
            <div
              key={user.request_id}
              className="flex items-center justify-between py-2.5 min-h-[2.75rem]"
            >
              <div className="min-w-0 pr-3">
                <p className="text-(--conversation-text-font-size) text-(--ui-text-primary) truncate">
                  {user.user_name ?? user.user_id}
                </p>
                <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary)">{user.platform}</p>
              </div>
              <button
                className="shrink-0 text-(--conversation-tool-font-size) px-3 py-1.5 rounded-md bg-(--ui-green) text-white active:opacity-80"
                onClick={() => void approveUser(user.platform, user.request_id!)}
              >
                Approve
              </button>
            </div>
          ))}
        </div>
      )}

      {pairing && pairing.approved.length > 0 && (
        <div>
          <SectionLabel label="Approved" />
          {pairing.approved.map(user => (
            <div
              key={user.user_id}
              className="flex items-center justify-between py-2.5 min-h-[2.75rem]"
            >
              <div className="min-w-0 pr-3">
                <p className="text-(--conversation-text-font-size) text-(--ui-text-primary) truncate">
                  {user.user_name ?? user.user_id}
                </p>
                <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary)">{user.platform}</p>
              </div>
              <button
                className="shrink-0 text-(--conversation-tool-font-size) px-3 py-1.5 rounded-md text-(--ui-red) active:opacity-70"
                onClick={() => void revokeUser(user.platform, user.user_id)}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {pairing && pairing.pending.length === 0 && pairing.approved.length === 0 && (
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">No paired users</p>
      )}
    </BottomSheet>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pb-1 pt-2">
      <span className="shrink-0 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-(--ui-stroke-tertiary)" />
    </div>
  )
}
