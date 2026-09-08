import { useCallback, useEffect, useMemo, useState } from 'react'

import * as api from '@/gateway/api'
import { openExternalUrl } from '@/native'
import type { SessionInfo, SessionMessage } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

type ArtifactKind = 'file' | 'image' | 'link'

interface ArtifactRecord {
  id: string
  kind: ArtifactKind
  label: string
  sessionId: string
  sessionTitle: string
  value: string
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g
const MARKDOWN_LINK_RE = /!?\[([^\]]*)\]\((https?:\/\/[^)\s]+|(?:\/|\.\.?\/)[^)\s]+)\)/g
const FILE_RE = /\.(?:png|jpe?g|gif|webp|svg|pdf|csv|json|txt|md|zip|tar|gz|mp3|wav|mp4|mov)(?:\?.*)?$/i
const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|svg)(?:\?.*)?$/i

function asText(message: SessionMessage): string {
  if (typeof message.content === 'string') return message.content
  if (typeof message.text === 'string') return message.text
  if (typeof message.context === 'string') return message.context
  try { return JSON.stringify(message.content ?? '') } catch { return '' }
}

function labelFor(value: string): string {
  try { return new URL(value).pathname.split('/').filter(Boolean).pop() || value } catch { return value.split(/[\\/]/).filter(Boolean).pop() || value }
}

function collectArtifacts(session: SessionInfo, messages: SessionMessage[]): ArtifactRecord[] {
  const records = new Map<string, ArtifactRecord>()
  const add = (raw: string) => {
    const value = raw.trim().replace(/[),.;]+$/, '')
    if (!value || (!FILE_RE.test(value) && !value.startsWith('http://') && !value.startsWith('https://'))) return
    const key = `${session.id}:${value}`
    if (records.has(key)) return
    records.set(key, {
      id: key,
      kind: IMAGE_RE.test(value) ? 'image' : FILE_RE.test(value) ? 'file' : 'link',
      label: labelFor(value),
      sessionId: session.id,
      sessionTitle: session.title || session.preview || 'Untitled session',
      value
    })
  }

  for (const message of messages) {
    if (message.role !== 'assistant' && message.role !== 'tool') continue
    const text = asText(message)
    for (const match of text.matchAll(MARKDOWN_LINK_RE)) add(match[2] || '')
    for (const match of text.matchAll(URL_RE)) add(match[0] || '')
    // Tool responses commonly serialize generated file URLs under an explicit
    // key; scanning only values with a file extension keeps ordinary logs out.
    for (const match of text.matchAll(/(?:file|path|url|artifact|attachment)[\w.-]*["']?\s*[:=]\s*["']?([^\s"',}\]]+)/gi)) add(match[1] || '')
  }
  return [...records.values()]
}

interface ArtifactsPageProps {
  onClose: () => void
  onOpenSession: (sessionId: string) => void
  open: boolean
}

/** Cross-session index for artifacts already recorded by the Gateway. Indexing
 * is read-only and deliberately sequential so a remote Gateway is not flooded
 * by transcript requests. */
export function ArtifactsPage({ onClose, onOpenSession, open }: ArtifactsPageProps) {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const sessions = (await api.listSessions(30)).sessions
      const indexed: ArtifactRecord[] = []
      for (const session of sessions) {
        try {
          const messages = await api.getSessionMessages(session.id, { includeCompacted: true, limit: 240, order: 'latest' })
          indexed.push(...collectArtifacts(session, messages.messages))
        } catch {
          // A single unavailable/old session must not hide artifacts from the
          // other sessions in the Gateway history.
        }
      }
      setArtifacts(indexed)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load artifacts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (open) void refresh() }, [open, refresh])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? artifacts.filter(item => `${item.label} ${item.sessionTitle}`.toLowerCase().includes(needle)) : artifacts
  }, [artifacts, query])

  return (
    <ResponsiveSheet onClose={onClose} open={open} title="Artifacts">
      <div className="space-y-3">
        <div className="flex gap-2"><input className="webhook-input flex-1" onChange={event => setQuery(event.target.value)} placeholder="Filter artifacts" value={query} /><Button disabled={loading} onClick={() => void refresh()} size="sm" variant="secondary">Refresh</Button></div>
        <p className="text-xs text-(--ui-text-tertiary)">Indexes generated files and links from the latest 30 Gateway sessions.</p>
        {error ? <div className="rounded-md bg-(--ui-red)/10 px-2.5 py-2 text-xs text-(--ui-red)">{error}</div> : null}
        {loading ? <div className="py-8 text-center text-xs text-(--ui-text-quaternary)">Indexing session history…</div> : null}
        {!loading && !visible.length ? <div className="py-8 text-center text-xs text-(--ui-text-quaternary)">No generated files or links found.</div> : null}
        <div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">
          {visible.map(item => (
            <div className="flex items-center gap-3 border-b border-(--ui-stroke-tertiary) px-3 py-2.5 last:border-b-0" key={item.id}>
              <span className="rounded bg-(--ui-bg-quaternary) px-1.5 py-0.5 text-[0.65rem] text-(--ui-text-tertiary)">{item.kind}</span>
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpenSession(item.sessionId)} type="button"><span className="block truncate text-xs font-medium text-(--ui-text-primary)">{item.label}</span><span className="block truncate pt-0.5 text-[0.68rem] text-(--ui-text-quaternary)">{item.sessionTitle}</span></button>
              {item.value.startsWith('http') ? <button className="text-xs text-(--ui-accent)" onClick={() => void openExternalUrl(item.value)} type="button">Open</button> : null}
            </div>
          ))}
        </div>
      </div>
    </ResponsiveSheet>
  )
}
