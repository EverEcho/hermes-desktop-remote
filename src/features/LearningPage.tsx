import { useCallback, useEffect, useMemo, useState } from 'react'

import * as api from '@/gateway/api'
import type { LearningNodeDetail, StarmapGraph } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface LearningPageProps { onClose: () => void; open: boolean }

/** Remote profile learning index. It renders a compact, filterable equivalent
 * of the desktop star map on small screens while preserving node editing and
 * archiving through Gateway-owned endpoints. */
export function LearningPage({ onClose, open }: LearningPageProps) {
  const [graph, setGraph] = useState<StarmapGraph | null>(null)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<(LearningNodeDetail & { id: string }) | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => { setLoading(true); setNotice(''); try { setGraph(await api.getStarmapGraph()) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to load learning graph') } finally { setLoading(false) } }, [])
  useEffect(() => { if (open) void refresh() }, [open, refresh])
  const nodes = useMemo(() => { const needle = query.trim().toLowerCase(); return (graph?.nodes ?? []).filter(node => !needle || `${node.label} ${node.category ?? ''} ${node.kind}`.toLowerCase().includes(needle)) }, [graph, query])
  const openNode = async (id: string) => { setWorking(true); try { const node = await api.getLearningNode(id); setDetail({ ...node, id }); setDraft(node.content) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to load learning node') } finally { setWorking(false) } }
  const save = async () => { if (!detail) return; setWorking(true); try { const result = await api.editLearningNode(detail.id, draft); setNotice(result.message || 'Learning node saved.'); setDetail({ ...detail, content: draft }); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to save learning node') } finally { setWorking(false) } }
  const remove = async () => { if (!detail || !window.confirm(`Archive “${detail.label}”?`)) return; setWorking(true); try { const result = await api.deleteLearningNode(detail.id); setNotice(result.message || 'Learning node archived.'); setDetail(null); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to archive learning node') } finally { setWorking(false) } }

  return <ResponsiveSheet onClose={onClose} open={open} title="Learning map"><div className="space-y-3">{detail ? <><button className="text-xs text-(--ui-accent)" onClick={() => setDetail(null)} type="button">Back to learning map</button><div className="text-xs font-medium text-(--ui-text-primary)">{detail.label}</div><textarea className="webhook-input min-h-56 resize-y font-mono text-[0.72rem]" disabled={working} onChange={event => setDraft(event.target.value)} value={draft} /><div className="flex justify-end gap-2"><Button disabled={working} onClick={() => void remove()} size="sm" variant="destructive">Archive</Button><Button disabled={working || draft === detail.content} onClick={() => void save()} size="sm">Save</Button></div></> : <><div className="flex gap-2"><input className="webhook-input flex-1" onChange={event => setQuery(event.target.value)} placeholder="Filter learned skills and memories" value={query} /><Button disabled={loading} onClick={() => void refresh()} size="sm" variant="secondary">Refresh</Button></div><p className="text-xs text-(--ui-text-tertiary)">{graph ? `${graph.nodes.length} nodes · ${graph.edges.length} relationships` : 'Gateway profile learning graph'}</p>{loading ? <div className="py-8 text-center text-xs text-(--ui-text-quaternary)">Loading learning graph…</div> : null}<div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">{!loading && !nodes.length ? <div className="px-3 py-8 text-center text-xs text-(--ui-text-quaternary)">No learned nodes yet.</div> : null}{nodes.map(node => <button className="flex w-full items-center gap-3 border-b border-(--ui-stroke-tertiary) px-3 py-2.5 text-left last:border-b-0 hover:bg-(--chrome-action-hover)" disabled={working} key={node.id} onClick={() => void openNode(node.id)} type="button"><span className="rounded bg-(--ui-bg-quaternary) px-1.5 py-0.5 text-[0.65rem] text-(--ui-text-tertiary)">{node.kind}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-(--ui-text-primary)">{node.label}</span><span className="mt-0.5 block truncate text-[0.68rem] text-(--ui-text-quaternary)">{node.category || node.state || 'General'}{node.useCount ? ` · used ${node.useCount}×` : ''}</span></span></button>)}</div></>}{notice ? <div className="rounded-md bg-(--ui-bg-quaternary) px-2.5 py-2 text-xs text-(--ui-text-secondary)">{notice}</div> : null}</div></ResponsiveSheet>
}
