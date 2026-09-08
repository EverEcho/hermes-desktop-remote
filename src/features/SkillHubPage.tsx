import { useCallback, useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { SkillHubPreview, SkillHubResult, SkillHubScanResult, SkillHubSourcesResponse } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface SkillHubPageProps { onClose: () => void; onInstalled: () => void; open: boolean }

/** Browses skills through the connected Gateway. Downloads, scans, installs,
 * updates and removal all happen on that Gateway rather than the UI device. */
export function SkillHubPage({ onClose, onInstalled, open }: SkillHubPageProps) {
  const [sources, setSources] = useState<SkillHubSourcesResponse | null>(null)
  const [results, setResults] = useState<SkillHubResult[]>([])
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<SkillHubPreview | null>(null)
  const [scan, setScan] = useState<SkillHubScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setNotice('')
    try { const data = await api.getSkillHubSources(); setSources(data); setResults(data.featured ?? []) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Skill Hub is unavailable on this Gateway.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (open) void load() }, [open, load])

  const search = async () => {
    setLoading(true); setNotice('')
    try { const data = await api.searchSkillsHub(query.trim()); setResults(data.results); setSources(current => current ? { ...current, installed: data.installed } : current); if (data.timed_out.length) setNotice(`Timed out sources: ${data.timed_out.join(', ')}`) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to search Skill Hub') } finally { setLoading(false) }
  }
  const openPreview = async (item: SkillHubResult) => { setWorking(`preview:${item.identifier}`); try { setPreview(await api.previewSkillHub(item.identifier)) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to load skill preview') } finally { setWorking(null) } }
  const inspect = async (item: SkillHubResult) => { setWorking(`scan:${item.identifier}`); try { setScan(await api.scanSkillHub(item.identifier)) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to scan skill') } finally { setWorking(null) } }
  const install = async (item: SkillHubResult) => { if (!window.confirm(`Install “${item.name}” from ${item.source} on the connected Gateway?`)) return; setWorking(`install:${item.identifier}`); try { const result = await api.installSkillFromHub(item.identifier); setNotice(result.message || `${item.name} installed.`); onInstalled(); await load() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to install skill') } finally { setWorking(null) } }
  const uninstall = async (item: SkillHubResult) => {
    const installedName = sources?.installed[item.identifier]?.name || item.name
    if (!window.confirm(`Remove “${installedName}” from the connected Gateway?`)) return
    setWorking(`remove:${item.identifier}`)
    try { const result = await api.uninstallSkillFromHub(installedName); setNotice(result.message || `${installedName} removed.`); onInstalled(); await load() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to remove skill') } finally { setWorking(null) }
  }
  const update = async () => { if (!window.confirm('Update installed Hub skills on the connected Gateway?')) return; setWorking('update'); try { const result = await api.updateSkillsFromHub(); setNotice(result.message || 'Skill updates started.'); onInstalled(); await load() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to update skills') } finally { setWorking(null) } }

  return <ResponsiveSheet onClose={onClose} open={open} title="Skills Hub"><div className="space-y-3"><div className="flex gap-2"><input className="webhook-input flex-1" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void search() }} placeholder="Search remote skills" value={query} /><Button disabled={loading} onClick={() => void search()} size="sm">Search</Button></div><div className="flex items-center justify-between text-[0.68rem] text-(--ui-text-quaternary)"><span>{sources?.sources.filter(source => source.available !== false).map(source => source.label).join(' · ') || 'Gateway-managed sources'}</span><Button disabled={working !== null} onClick={() => void update()} size="sm" variant="secondary">Update installed</Button></div>{notice ? <div className="rounded-md bg-(--ui-bg-quaternary) px-2.5 py-2 text-xs text-(--ui-text-secondary)">{notice}</div> : null}{loading ? <div className="py-8 text-center text-xs text-(--ui-text-quaternary)">Loading Skill Hub…</div> : null}<div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">{!loading && !results.length ? <div className="px-3 py-8 text-center text-xs text-(--ui-text-quaternary)">No skills found.</div> : null}{results.map(item => <SkillHubRow installed={Boolean(sources?.installed[item.identifier])} item={item} key={item.identifier} onInstall={install} onPreview={openPreview} onRemove={uninstall} onScan={inspect} working={working?.endsWith(item.identifier) ?? false} />)}</div>{preview ? <PreviewSheet onClose={() => setPreview(null)} preview={preview} /> : null}{scan ? <ScanSheet onClose={() => setScan(null)} scan={scan} /> : null}</div></ResponsiveSheet>
}

function SkillHubRow({ installed, item, onInstall, onPreview, onRemove, onScan, working }: { installed: boolean; item: SkillHubResult; onInstall: (item: SkillHubResult) => void; onPreview: (item: SkillHubResult) => void; onRemove: (item: SkillHubResult) => void; onScan: (item: SkillHubResult) => void; working: boolean }) {
  return <div className="border-b border-(--ui-stroke-tertiary) px-3 py-2.5 last:border-b-0"><div className="flex gap-2"><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium text-(--ui-text-primary)">{item.name}</div><div className="mt-0.5 line-clamp-2 text-[0.68rem] text-(--ui-text-tertiary)">{item.description}</div><div className="mt-1 text-[0.65rem] text-(--ui-text-quaternary)">{item.source} · {item.trust_level}</div></div><div className="flex shrink-0 flex-col gap-1"><button className="text-[0.68rem] text-(--ui-accent) disabled:opacity-40" disabled={working} onClick={() => void onPreview(item)} type="button">Preview</button><button className="text-[0.68rem] text-(--ui-accent) disabled:opacity-40" disabled={working} onClick={() => void onScan(item)} type="button">Scan</button>{installed ? <button className="text-[0.68rem] text-(--ui-red) disabled:opacity-40" disabled={working} onClick={() => void onRemove(item)} type="button">Remove</button> : <button className="text-[0.68rem] text-(--ui-accent) disabled:opacity-40" disabled={working} onClick={() => void onInstall(item)} type="button">Install</button>}</div></div></div>
}

function PreviewSheet({ onClose, preview }: { onClose: () => void; preview: SkillHubPreview }) { return <ResponsiveSheet compact onClose={onClose} open title={preview.name}><div className="space-y-3"><p className="text-xs text-(--ui-text-tertiary)">{preview.description}</p><div className="text-[0.68rem] text-(--ui-text-quaternary)">{preview.files.join(' · ') || 'No file list provided'}</div><pre className="max-h-80 overflow-auto rounded-md bg-black/90 p-3 text-[0.68rem] leading-relaxed text-slate-100 whitespace-pre-wrap">{preview.skill_md}</pre></div></ResponsiveSheet> }

function ScanSheet({ onClose, scan }: { onClose: () => void; scan: SkillHubScanResult }) { return <ResponsiveSheet compact onClose={onClose} open title={`${scan.name} · Security scan`}><div className="space-y-3"><div className={`rounded-md px-3 py-2 text-xs ${scan.policy === 'block' ? 'bg-red-500/10 text-(--ui-red)' : scan.policy === 'ask' ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}`}>{scan.verdict} · {scan.summary}</div>{scan.policy_reason ? <p className="text-xs text-(--ui-text-tertiary)">{scan.policy_reason}</p> : null}{scan.findings.length ? <div className="space-y-2">{scan.findings.map((finding, index) => <div className="rounded-md bg-(--ui-bg-quaternary) px-2.5 py-2 text-xs" key={`${finding.file}:${finding.line ?? index}`}><div className="font-medium">{finding.severity} · {finding.category}</div><div className="mt-1 text-(--ui-text-tertiary)">{finding.file}{finding.line ? `:${finding.line}` : ''} · {finding.description}</div></div>)}</div> : <p className="text-xs text-(--ui-text-tertiary)">No findings reported by the Gateway.</p>}</div></ResponsiveSheet> }
