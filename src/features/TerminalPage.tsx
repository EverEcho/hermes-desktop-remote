import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'

import * as api from '@/gateway/api'
import { $terminalOutputs, type TerminalOutput } from '@/gateway/event-router'
import type { TerminalBackendInfo, TerminalBackendsResponse } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface TerminalPageProps {
  onClose: () => void
  open: boolean
  sessionId?: string | null
}

function statusCopy(status: TerminalBackendInfo['status']): string {
  if (status === 'ready') return 'Ready'
  if (status === 'needs_setup') return 'Needs setup'
  return 'Unavailable'
}

/** Remote terminal controls. This intentionally has no local shell, PTY, or
 * filesystem access: process output and backend health are supplied by the
 * connected Gateway, which keeps the same behavior on desktop and mobile. */
export function TerminalPage({ onClose, open, sessionId }: TerminalPageProps) {
  const outputs = useStore($terminalOutputs)
  const [backends, setBackends] = useState<TerminalBackendsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setBackends(await api.getTerminalBackends())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load terminal backends')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const sessionOutputs = useMemo(() => {
    const list = [...outputs.values()]
    return (sessionId ? list.filter(output => output.sessionId === sessionId) : list)
      .sort((left, right) => left.processId.localeCompare(right.processId))
  }, [outputs, sessionId])

  const select = async (backend: TerminalBackendInfo) => {
    if (selecting || backend.active) return
    setSelecting(backend.name)
    setError('')
    try {
      await api.selectTerminalBackend(backend.name)
      setBackends(current => current && {
        ...current,
        active: backend.name,
        backends: current.backends.map(item => ({ ...item, active: item.name === backend.name }))
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to select terminal backend')
    } finally {
      setSelecting(null)
    }
  }

  return (
    <ResponsiveSheet onClose={onClose} open={open} title="Remote terminal">
      <div className="space-y-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-(--ui-text-primary)">Execution backend</div>
              <p className="mt-1 text-xs text-(--ui-text-tertiary)">Commands run on the connected Gateway, never on this device.</p>
            </div>
            <Button disabled={loading || selecting !== null} onClick={() => void refresh()} size="sm" variant="secondary">Refresh</Button>
          </div>
          {loading && !backends ? <div className="py-3 text-xs text-(--ui-text-quaternary)">Loading backends…</div> : null}
          <div className="space-y-1.5">
            {backends?.backends.map(backend => (
              <button
                aria-pressed={backend.active}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${backend.active ? 'border-(--ui-accent)/50 bg-(--ui-accent)/5' : 'border-(--ui-stroke-tertiary) hover:bg-(--chrome-action-hover)'}`}
                disabled={selecting !== null}
                key={backend.name}
                onClick={() => void select(backend)}
                type="button"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-(--ui-text-primary)">
                  <span className="min-w-0 flex-1 truncate">{backend.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[0.65rem] ${backend.status === 'ready' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>{statusCopy(backend.status)}</span>
                  {backend.active ? <span className="text-[0.65rem] text-(--ui-accent)">In use</span> : null}
                  {selecting === backend.name ? <span className="text-[0.65rem] text-(--ui-text-quaternary)">Selecting…</span> : null}
                </span>
                <span className="mt-1 block text-[0.7rem] text-(--ui-text-tertiary)">{backend.description}</span>
                {backend.detail ? <span className="mt-1 block text-[0.68rem] text-amber-600">{backend.detail}</span> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div>
            <div className="text-xs font-medium text-(--ui-text-primary)">Live output</div>
            <p className="mt-1 text-xs text-(--ui-text-tertiary)">{sessionId ? 'Output from the current session.' : 'Output received during this connection.'}</p>
          </div>
          {sessionOutputs.length ? sessionOutputs.map(output => <TerminalOutputCard key={output.processId} output={output} />) : (
            <div className="rounded-lg border border-dashed border-(--ui-stroke-tertiary) px-3 py-6 text-center text-xs text-(--ui-text-quaternary)">No terminal output received yet.</div>
          )}
        </section>
        {error ? <div className="rounded-md bg-(--ui-red)/10 px-2.5 py-2 text-xs text-(--ui-red)">{error}</div> : null}
      </div>
    </ResponsiveSheet>
  )
}

function TerminalOutputCard({ output }: { output: TerminalOutput }) {
  return (
    <div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">
      <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2 text-[0.68rem] text-(--ui-text-tertiary)">
        <span className="min-w-0 flex-1 truncate">{output.title || output.processId}</span>
        {output.exitCode !== undefined ? <span className={output.exitCode === 0 ? 'text-emerald-600' : 'text-(--ui-red)'}>Exit {output.exitCode}</span> : null}
      </div>
      <pre className="max-h-64 overflow-auto bg-black/90 p-3 font-mono text-[0.68rem] leading-relaxed text-slate-100 whitespace-pre-wrap">{output.chunk || 'Waiting for output…'}</pre>
    </div>
  )
}
