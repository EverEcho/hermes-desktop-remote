import { useCallback, useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { ComputerUseStatus } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface ComputerUsePageProps { onClose: () => void; open: boolean }

/** Computer Use controls the Gateway host, not the device running this UI.
 * That distinction keeps remote desktop/mobile clients honest about where
 * screenshots and input actions will occur. */
export function ComputerUsePage({ onClose, open }: ComputerUsePageProps) {
  const [status, setStatus] = useState<ComputerUseStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const refresh = useCallback(async () => { setLoading(true); setNotice(''); try { setStatus(await api.getComputerUseStatus()) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to read Computer Use status') } finally { setLoading(false) } }, [])
  useEffect(() => { if (open) void refresh() }, [open, refresh])
  const grant = async () => { if (!window.confirm('Request Computer Use permissions on the Gateway host?')) return; setWorking(true); try { const result = await api.grantComputerUsePermissions(); setNotice(result.message || (result.ok ? 'Permission request started on the Gateway host.' : 'Permission request could not start.')); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to request permissions') } finally { setWorking(false) } }
  return <ResponsiveSheet onClose={onClose} open={open} title="Computer Use"><div className="space-y-3"><p className="text-xs leading-relaxed text-(--ui-text-tertiary)">This capability drives the connected Gateway host—not this phone, browser, or desktop client.</p>{status ? <><div className="rounded-lg border border-(--ui-stroke-tertiary) p-3 text-xs"><div className="flex justify-between"><span className="text-(--ui-text-tertiary)">Gateway platform</span><span>{status.platform}</span></div><div className="mt-1 flex justify-between"><span className="text-(--ui-text-tertiary)">Driver</span><span>{status.installed ? status.version || 'Installed' : 'Not installed'}</span></div><div className="mt-1 flex justify-between"><span className="text-(--ui-text-tertiary)">Readiness</span><span className={status.ready ? 'text-emerald-600' : 'text-(--ui-red)'}>{status.ready ? 'Ready' : 'Not ready'}</span></div>{status.can_grant ? <><div className="mt-1 flex justify-between"><span className="text-(--ui-text-tertiary)">Accessibility</span><span>{status.accessibility ? 'Granted' : 'Not granted'}</span></div><div className="mt-1 flex justify-between"><span className="text-(--ui-text-tertiary)">Screen recording</span><span>{status.screen_recording ? 'Granted' : 'Not granted'}</span></div></> : null}</div>{status.checks.filter(check => check.status !== 'ok').map(check => <div className="rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700" key={check.label}>{check.label}: {check.message}</div>)}</> : null}<div className="flex justify-end gap-2"><Button disabled={loading || working} onClick={() => void refresh()} size="sm" variant="secondary">Refresh</Button>{status?.can_grant ? <Button disabled={working || !status.platform_supported} onClick={() => void grant()} size="sm">Request permissions</Button> : null}</div>{loading ? <div className="text-xs text-(--ui-text-quaternary)">Checking Gateway host…</div> : null}{notice ? <div className="rounded-md bg-(--ui-bg-quaternary) px-2.5 py-2 text-xs text-(--ui-text-secondary)">{notice}</div> : null}</div></ResponsiveSheet>
}
