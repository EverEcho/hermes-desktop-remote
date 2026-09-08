import { useCallback, useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { McpCatalogEntry, McpServerSummary, McpTestResult } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { openExternalUrl } from '@/native'

interface McpServersPageProps { onClose: () => void; open: boolean }

/** MCP definitions and catalog installations are persisted by the connected
 * Gateway. This client never runs an MCP command on its own device. */
export function McpServersPage({ onClose, open }: McpServersPageProps) {
  const [servers, setServers] = useState<McpServerSummary[]>([])
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [auth, setAuth] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [oauthFlow, setOauthFlow] = useState<{ id: string; name: string } | null>(null)

  const refresh = useCallback(async () => {
    setWorking('refresh'); setNotice('')
    try {
      const [configured, catalogResponse] = await Promise.all([api.listMcpServers(), api.getMcpCatalog().catch(() => null)])
      setServers(configured.servers ?? [])
      if (catalogResponse) setCatalog(catalogResponse.entries ?? [])
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Unable to load MCP servers')
    } finally { setWorking(null) }
  }, [])

  useEffect(() => { if (open) void refresh() }, [open, refresh])
  useEffect(() => {
    if (!oauthFlow) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void api.getMcpOAuthFlow(oauthFlow.id).then(flow => {
        if (cancelled || flow.status === 'starting' || flow.status === 'authorization_required') return
        window.clearInterval(timer)
        setOauthFlow(null)
        if (flow.status === 'approved') { setNotice(`${oauthFlow.name} authorized.`); void refresh() }
        else setNotice(flow.error || `${oauthFlow.name} authorization did not complete.`)
      }).catch(() => undefined)
    }, 2_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [oauthFlow, refresh])

  const add = async () => {
    const nextName = name.trim()
    if (!nextName || (!url.trim() && !command.trim())) { setNotice('Provide either a remote URL or a Gateway-side command.'); return }
    setWorking('add'); setNotice('')
    try {
      await api.addMcpServer({ name: nextName, ...(url.trim() ? { url: url.trim() } : {}), ...(auth.trim() ? { auth: auth.trim() } : {}), ...(command.trim() ? { command: command.trim(), args: args.split(/\s+/).filter(Boolean) } : {}) })
      setName(''); setUrl(''); setAuth(''); setCommand(''); setArgs(''); await refresh()
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to add MCP server') } finally { setWorking(null) }
  }

  const toggle = async (server: McpServerSummary) => {
    setWorking(server.name)
    try { await api.setMcpServerEnabled(server.name, !server.enabled); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to update MCP server') } finally { setWorking(null) }
  }
  const remove = async (server: McpServerSummary) => {
    if (!window.confirm(`Remove MCP server “${server.name}” from the connected Gateway?`)) return
    setWorking(server.name)
    try { await api.removeMcpServer(server.name); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to remove MCP server') } finally { setWorking(null) }
  }
  const test = async (server: McpServerSummary) => {
    setWorking(server.name)
    try { const result: McpTestResult = await api.testMcpServer(server.name); setNotice(result.ok ? `${server.name}: connected (${result.tools.length} tools)` : `${server.name}: ${result.error || 'connection failed'}`) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to test MCP server') } finally { setWorking(null) }
  }
  const install = async (entry: McpCatalogEntry) => {
    const env: Record<string, string> = {}
    for (const field of entry.required_env) {
      const value = window.prompt(field.prompt || `Value for ${field.name}`)
      if (field.required && !value?.trim()) return
      if (value?.trim()) env[field.name] = value.trim()
    }
    setWorking(`catalog:${entry.name}`); setNotice('')
    try { await api.installMcpCatalogEntry(entry.name, env); setNotice(`${entry.name} installed on the connected Gateway.`); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to install MCP server') } finally { setWorking(null) }
  }
  const authorize = async (server: McpServerSummary) => {
    setWorking(`auth:${server.name}`); setNotice('')
    try {
      const flow = await api.authMcpServer(server.name)
      if (flow.authorization_url) await openExternalUrl(flow.authorization_url)
      if (flow.status === 'approved') { setNotice(`${server.name} authorized.`); await refresh() }
      else setOauthFlow({ id: flow.flow_id, name: server.name })
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'This MCP server does not expose OAuth authorization.') } finally { setWorking(null) }
  }
  const cancelAuthorization = async () => {
    if (!oauthFlow) return
    try { await api.cancelMcpOAuthFlow(oauthFlow.id) } catch { /* server may already have ended the flow */ }
    setOauthFlow(null)
  }

  return <ResponsiveSheet onClose={onClose} open={open} title="MCP servers"><div className="space-y-4">
    <section className="space-y-2 rounded-lg border border-(--ui-stroke-tertiary) p-3">
      <div className="text-xs font-medium text-(--ui-text-primary)">Add remote server</div>
      <input className="webhook-input" disabled={working !== null} onChange={event => setName(event.target.value)} placeholder="Name" value={name} />
      <input className="webhook-input" disabled={working !== null} onChange={event => setUrl(event.target.value)} placeholder="Remote URL (HTTP/SSE)" value={url} />
      <input className="webhook-input" disabled={working !== null} onChange={event => setAuth(event.target.value)} placeholder="Authorization value (optional)" type="password" value={auth} />
      <input className="webhook-input" disabled={working !== null} onChange={event => setCommand(event.target.value)} placeholder="Gateway-side command (alternative)" value={command} />
      <input className="webhook-input" disabled={working !== null} onChange={event => setArgs(event.target.value)} placeholder="Command arguments, space separated" value={args} />
      <Button disabled={working !== null || !name.trim()} onClick={() => void add()} size="sm">Add server</Button>
    </section>
    {catalog.length ? <section className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)"><div className="border-b border-(--ui-stroke-tertiary) px-3 py-2 text-xs font-medium">Recommended catalog</div>{catalog.map(entry => <div className="border-b border-(--ui-stroke-tertiary) px-3 py-2.5 last:border-b-0" key={entry.name}><div className="flex gap-3"><div className="min-w-0 flex-1"><div className="text-xs font-medium text-(--ui-text-primary)">{entry.name}</div><div className="mt-0.5 text-[0.68rem] text-(--ui-text-tertiary)">{entry.description}</div></div>{entry.enabled ? <span className="text-[0.68rem] text-emerald-600">Enabled</span> : <Button disabled={working !== null} onClick={() => void install(entry)} size="sm" variant="secondary">{working === `catalog:${entry.name}` ? 'Installing…' : entry.installed ? 'Enable' : 'Install'}</Button>}</div></div>)}</section> : null}
    {notice ? <div className="rounded-md bg-(--ui-bg-quaternary) px-2.5 py-2 text-xs text-(--ui-text-secondary)">{notice}</div> : null}
    {oauthFlow ? <div className="flex items-center justify-between rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700"><span>Waiting for {oauthFlow.name} authorization in browser…</span><button className="text-(--ui-accent)" onClick={() => void cancelAuthorization()} type="button">Cancel</button></div> : null}
    <section className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)"><div className="flex items-center justify-between border-b border-(--ui-stroke-tertiary) px-3 py-2 text-xs font-medium"><span>Configured servers</span><button className="text-(--ui-accent)" disabled={working !== null} onClick={() => void refresh()} type="button">Refresh</button></div>{!servers.length ? <div className="px-3 py-6 text-center text-xs text-(--ui-text-quaternary)">No MCP servers configured.</div> : null}{servers.map(server => <div className="border-b border-(--ui-stroke-tertiary) px-3 py-2.5 last:border-b-0" key={server.name}><div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs font-medium text-(--ui-text-primary)">{server.name}</span><span className={server.enabled ? 'text-[0.65rem] text-emerald-600' : 'text-[0.65rem] text-(--ui-text-quaternary)'}>{server.enabled ? 'Enabled' : 'Disabled'}</span></div><div className="mt-1 truncate font-mono text-[0.65rem] text-(--ui-text-quaternary)">{server.url || [server.command, ...(server.args ?? [])].filter(Boolean).join(' ') || 'Gateway configured'}</div><div className="mt-2 flex gap-3 text-[0.68rem]"><button className="text-(--ui-accent) disabled:opacity-40" disabled={working !== null} onClick={() => void toggle(server)} type="button">{server.enabled ? 'Disable' : 'Enable'}</button><button className="text-(--ui-accent) disabled:opacity-40" disabled={working !== null} onClick={() => void test(server)} type="button">Test</button><button className="text-(--ui-accent) disabled:opacity-40" disabled={working !== null} onClick={() => void authorize(server)} type="button">Authorize</button><button className="text-(--ui-red) disabled:opacity-40" disabled={working !== null} onClick={() => void remove(server)} type="button">Remove</button></div></div>)}</section>
  </div></ResponsiveSheet>
}
