import { useCallback, useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { CuratorStatusResponse, MemoryStatusResponse } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { MemoryProviderSheet } from './MemoryProviderSheet'

interface MemoryPageProps { onClose: () => void; open: boolean }

function bytes(value: number): string {
  if (!value) return 'Empty'
  if (value < 1024) return `${value} B`
  return `${(value / 1024).toFixed(1)} KB`
}

/** Remote Gateway memory status and curator controls. Destructive calls only
 * occur after an explicit confirmation in this panel. */
export function MemoryPage({ onClose, open }: MemoryPageProps) {
  const [memory, setMemory] = useState<MemoryStatusResponse | null>(null)
  const [curator, setCurator] = useState<CuratorStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [providerConfig, setProviderConfig] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setNotice('')
    const [memoryResult, curatorResult] = await Promise.allSettled([api.getMemoryStatus(), api.getCuratorStatus()])
    if (memoryResult.status === 'fulfilled') setMemory(memoryResult.value)
    if (curatorResult.status === 'fulfilled') setCurator(curatorResult.value)
    if (memoryResult.status === 'rejected' && curatorResult.status === 'rejected') setNotice('This Gateway does not expose memory maintenance endpoints.')
    setLoading(false)
  }, [])

  useEffect(() => { if (open) void refresh() }, [open, refresh])

  const reset = async (target: 'all' | 'memory' | 'user') => {
    const label = target === 'all' ? 'all stored memory' : target === 'memory' ? 'assistant memory' : 'user memory'
    if (!window.confirm(`Clear ${label} on the connected Gateway? This cannot be undone.`)) return
    setWorking(true)
    try {
      const result = await api.resetMemory(target)
      setNotice(result.deleted.length ? `Cleared: ${result.deleted.join(', ')}` : 'The selected memory was already empty.')
      await refresh()
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to clear memory') } finally { setWorking(false) }
  }

  const toggleCurator = async () => {
    if (!curator) return
    setWorking(true)
    try { await api.setCuratorPaused(!curator.paused); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to update Curator') } finally { setWorking(false) }
  }

  const runCurator = async () => {
    if (!window.confirm('Run the Gateway Curator now?')) return
    setWorking(true)
    try { const result = await api.runCurator(); setNotice(result.message || 'Curator started.'); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to run Curator') } finally { setWorking(false) }
  }

  return <ResponsiveSheet onClose={onClose} open={open} title="Memory & Curator"><div className="space-y-5">
    <div className="flex justify-end"><Button disabled={loading || working} onClick={() => void refresh()} size="sm" variant="secondary">Refresh</Button></div>
    <section className="space-y-2"><div><div className="text-xs font-medium text-(--ui-text-primary)">Gateway memory</div><p className="mt-1 text-xs text-(--ui-text-tertiary)">Memory belongs to the active remote profile.</p></div>
      {memory ? <div className="rounded-lg border border-(--ui-stroke-tertiary) p-3 text-xs"><div className="flex justify-between"><span className="text-(--ui-text-tertiary)">Active provider</span><span className="font-medium text-(--ui-text-primary)">{memory.active}</span></div><div className="mt-2 flex justify-between"><span className="text-(--ui-text-tertiary)">Assistant memory</span><span>{bytes(memory.builtin_files.memory)}</span></div><div className="mt-1 flex justify-between"><span className="text-(--ui-text-tertiary)">User memory</span><span>{bytes(memory.builtin_files.user)}</span></div><div className="mt-3 space-y-1 border-t border-(--ui-stroke-tertiary) pt-2">{memory.providers.length ? memory.providers.map(provider => <button className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-(--chrome-action-hover)" key={provider.name} onClick={() => setProviderConfig(provider.name)} type="button"><span className="min-w-0 flex-1 truncate text-[0.7rem] text-(--ui-text-secondary)">{provider.name}</span><span className={provider.configured ? 'text-[0.65rem] text-emerald-600' : 'text-[0.65rem] text-(--ui-text-quaternary)'}>{provider.configured ? 'Configured' : 'Configure'}</span></button>) : <span className="text-[0.7rem] text-(--ui-text-quaternary)">No providers reported</span>}</div></div> : null}
      <div className="flex flex-wrap gap-2"><Button disabled={working || !memory} onClick={() => void reset('memory')} size="sm" variant="secondary">Clear assistant memory</Button><Button disabled={working || !memory} onClick={() => void reset('user')} size="sm" variant="secondary">Clear user memory</Button><Button disabled={working || !memory} onClick={() => void reset('all')} size="sm" variant="destructive">Clear all</Button></div></section>
    <section className="space-y-2 border-t border-(--ui-stroke-tertiary) pt-4"><div className="text-xs font-medium text-(--ui-text-primary)">Skill Curator</div>{curator ? <div className="rounded-lg border border-(--ui-stroke-tertiary) p-3 text-xs"><div className="flex justify-between"><span className="text-(--ui-text-tertiary)">Status</span><span>{!curator.enabled ? 'Disabled' : curator.paused ? 'Paused' : 'Running on schedule'}</span></div><div className="mt-1 flex justify-between"><span className="text-(--ui-text-tertiary)">Interval</span><span>{curator.interval_hours ? `${curator.interval_hours} hours` : 'Not scheduled'}</span></div><div className="mt-1 flex justify-between"><span className="text-(--ui-text-tertiary)">Last run</span><span>{curator.last_run_at || 'Never'}</span></div></div> : null}<div className="flex gap-2"><Button disabled={working || !curator?.enabled} onClick={() => void toggleCurator()} size="sm" variant="secondary">{curator?.paused ? 'Resume Curator' : 'Pause Curator'}</Button><Button disabled={working || !curator?.enabled} onClick={() => void runCurator()} size="sm">Run now</Button></div></section>
    {loading ? <div className="text-xs text-(--ui-text-quaternary)">Loading remote maintenance status…</div> : null}{notice ? <div className="rounded-md bg-(--ui-bg-quaternary) px-2.5 py-2 text-xs text-(--ui-text-secondary)">{notice}</div> : null}
    {providerConfig ? <MemoryProviderSheet name={providerConfig} onClose={() => setProviderConfig(null)} open /> : null}
  </div></ResponsiveSheet>
}
