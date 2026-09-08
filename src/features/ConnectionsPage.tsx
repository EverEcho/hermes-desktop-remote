import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $authState, logout, switchConnection } from '@/auth'
import { clearAllAuth, loadRemoteGatewayRegistry, saveRemoteGatewayRegistry } from '@/auth/token-store'
import { getActiveRemoteGatewayConnection, removeRemoteGatewayConnection, setPrimaryRemoteGatewayConnection, updateRemoteGatewayConnection, type RemoteGatewayConnection, type RemoteGatewayRegistry } from '@/core/connections/registry'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface ConnectionsPageProps { onAddConnection: () => void; onClose: () => void; open: boolean }

/** Saved remote Gateway registry. Removing a route also removes only that
 * route's credential material; it never affects any other remote Gateway. */
export function ConnectionsPage({ onAddConnection, onClose, open }: ConnectionsPageProps) {
  const auth = useStore($authState)
  const [registry, setRegistry] = useState<RemoteGatewayRegistry | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => { try { setRegistry(await loadRemoteGatewayRegistry()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load saved Gateways') } }, [])
  useEffect(() => { if (open) void refresh() }, [open, refresh])
  const select = async (id: string) => { if (auth.status === 'authenticated' && auth.connectionId === id) return; setWorking(id); try { await switchConnection(id); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to switch Gateway') } finally { setWorking(null) } }
  const remove = async (connection: RemoteGatewayConnection) => {
    if (!window.confirm(`Remove saved Gateway “${connection.name}”? Its credentials on this device will also be removed.`)) return
    setWorking(connection.id); setError('')
    try {
      const current = registry ?? await loadRemoteGatewayRegistry()
      const next = removeRemoteGatewayConnection(current, connection.id)
      await clearAllAuth(connection.id)
      await saveRemoteGatewayRegistry(next)
      const fallback = getActiveRemoteGatewayConnection(next)
      if (auth.status === 'authenticated' && auth.connectionId === connection.id) {
        if (fallback) await switchConnection(fallback.id)
        else await logout()
      }
      setRegistry(next)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to remove Gateway') } finally { setWorking(null) }
  }
  const rename = async (connection: RemoteGatewayConnection) => {
    const name = window.prompt('Gateway display name', connection.name)?.trim()
    if (!name || name === connection.name || working) return
    setWorking(connection.id); setError('')
    try {
      const current = registry ?? await loadRemoteGatewayRegistry()
      const next = updateRemoteGatewayConnection(current, connection.id, { authMode: connection.authMode, baseUrl: connection.baseUrl, name, profile: connection.profile }, Date.now())
      await saveRemoteGatewayRegistry(next)
      setRegistry(next)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to rename Gateway') } finally { setWorking(null) }
  }
  const makePrimary = async (connection: RemoteGatewayConnection) => {
    if (working || registry?.primaryId === connection.id) return
    setWorking(connection.id); setError('')
    try {
      const current = registry ?? await loadRemoteGatewayRegistry()
      const next = setPrimaryRemoteGatewayConnection(current, connection.id)
      await saveRemoteGatewayRegistry(next)
      setRegistry(next)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to set primary Gateway') } finally { setWorking(null) }
  }
  return <ResponsiveSheet onClose={onClose} open={open} title="Remote Gateways"><div className="space-y-3"><p className="text-xs text-(--ui-text-tertiary)">Every entry is an externally reachable Gateway. This app never starts or owns a local Gateway process.</p><Button onClick={() => { onClose(); onAddConnection() }} size="sm">Connect another Gateway</Button>{error ? <div className="rounded-md bg-(--ui-red)/10 px-2.5 py-2 text-xs text-(--ui-red)">{error}</div> : null}<div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">{registry?.connections.length ? registry.connections.map(connection => <div className="flex items-center gap-3 border-b border-(--ui-stroke-tertiary) px-3 py-3 last:border-b-0" key={connection.id}><button className="min-w-0 flex-1 text-left" disabled={working !== null} onClick={() => void select(connection.id)} type="button"><span className="block truncate text-xs font-medium text-(--ui-text-primary)">{connection.name}</span><span className="mt-0.5 block truncate text-[0.68rem] text-(--ui-text-quaternary)">{connection.baseUrl} · {connection.profile}</span></button>{auth.status === 'authenticated' && auth.connectionId === connection.id ? <span className="text-[0.65rem] text-(--ui-accent)">Active</span> : null}{registry.primaryId === connection.id ? <span className="text-[0.65rem] text-amber-600">Primary</span> : null}<div className="flex shrink-0 gap-2 text-[0.68rem]"><button className="text-(--ui-text-tertiary) disabled:opacity-40" disabled={working !== null} onClick={() => void rename(connection)} type="button">Rename</button>{registry.primaryId !== connection.id ? <button className="text-(--ui-accent) disabled:opacity-40" disabled={working !== null} onClick={() => void makePrimary(connection)} type="button">Make primary</button> : null}<button className="text-(--ui-red) disabled:opacity-40" disabled={working !== null} onClick={() => void remove(connection)} type="button">Remove</button></div></div>) : <div className="px-3 py-7 text-center text-xs text-(--ui-text-quaternary)">No saved Gateways.</div>}</div></div></ResponsiveSheet>
}
