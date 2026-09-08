import { useCallback, useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface LogsPageProps { onClose: () => void; open: boolean }

/** Read-only Gateway log viewer, with server-side filtering to avoid pulling
 * unbounded diagnostic data to any client surface. */
export function LogsPage({ onClose, open }: LogsPageProps) {
  const [file, setFile] = useState('gui')
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { const result = await api.getLogs({ file, lines: 300, search: search.trim() || undefined }); setLines(result.lines ?? []) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load Gateway logs'); setLines([]) } finally { setLoading(false) } }, [file, search])
  useEffect(() => { if (open) void load() }, [open, load])
  return <ResponsiveSheet onClose={onClose} open={open} title="Gateway logs"><div className="space-y-3"><div className="flex gap-2"><select className="webhook-input w-28" onChange={event => setFile(event.target.value)} value={file}><option value="gui">GUI</option><option value="agent">Agent</option><option value="mcp">MCP</option></select><input className="webhook-input min-w-0 flex-1" onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void load() }} placeholder="Server-side search" value={search} /><Button disabled={loading} onClick={() => void load()} size="sm" variant="secondary">Refresh</Button></div>{error ? <div className="rounded-md bg-(--ui-red)/10 px-2.5 py-2 text-xs text-(--ui-red)">{error}</div> : null}<pre className="min-h-72 max-h-[58vh] overflow-auto rounded-lg bg-black/90 p-3 text-[0.68rem] leading-relaxed text-slate-100 whitespace-pre-wrap">{loading ? 'Loading logs…' : lines.join('\n') || 'No log entries.'}</pre></div></ResponsiveSheet>
}
