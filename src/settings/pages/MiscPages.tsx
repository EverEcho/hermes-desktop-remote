import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { version } from '../../../package.json'
import { $authState } from '@/auth'
import * as api from '@/gateway/api'
import { $connectionState } from '@/gateway'
import { useI18n } from '@/i18n'
import { Button, Spinner } from '@/ui/Button'
import { openExternalUrl } from '@/native'

import { BarChartIcon, ExternalLinkIcon, GlobeIcon } from '../icons'
import { Caption, Row, SectionHeading } from '../ui'

export function GatewayPage() {
  const { t } = useI18n()
  const g = t.settings.gatewayPage
  const authState = useStore($authState)
  const connectionState = useStore($connectionState)
  const [gatewayVersion, setGatewayVersion] = useState('')
  const [restarting, setRestarting] = useState(false)
  const [error, setError] = useState('')
  const [update, setUpdate] = useState<Awaited<ReturnType<typeof api.checkHermesUpdate>> | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [maintenanceWorking, setMaintenanceWorking] = useState<string | null>(null)
  const [maintenanceAction, setMaintenanceAction] = useState<string | null>(null)
  const [maintenanceLog, setMaintenanceLog] = useState<string[]>([])

  useEffect(() => {
    void api.getStatus().then(status => setGatewayVersion(status.version ?? '')).catch(() => {})
    void api.checkHermesUpdate().then(setUpdate).catch(() => {})
  }, [])

  const checkForUpdate = async () => {
    setCheckingUpdate(true)
    try { setUpdate(await api.checkHermesUpdate(true)) } catch (reason) { setError(reason instanceof Error ? reason.message : g.restartFailed) } finally { setCheckingUpdate(false) }
  }
  const applyUpdate = async () => {
    if (!window.confirm('Update Hermes on the connected Gateway now?')) return
    setUpdating(true)
    try { const result = await api.updateHermes(); setError(result.message || 'Gateway update started.') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update Gateway') } finally { setUpdating(false) }
  }
  const runMaintenance = async (kind: 'doctor' | 'security' | 'backup' | 'debug') => {
    if (!window.confirm(`Run ${kind === 'security' ? 'security audit' : kind} on the connected Gateway?`)) return
    setMaintenanceWorking(kind); setMaintenanceMessage('')
    try {
      const result = kind === 'doctor' ? await api.runGatewayDoctor()
        : kind === 'security' ? await api.runGatewaySecurityAudit()
          : kind === 'backup' ? await api.runGatewayBackup()
            : await api.createGatewayDebugShare()
      const archive = typeof (result as { archive?: unknown }).archive === 'string' ? (result as { archive: string }).archive : undefined
      const url = typeof (result as { url?: unknown }).url === 'string' ? (result as { url: string }).url : undefined
      setMaintenanceMessage(url || archive || result.message || 'Gateway action started.')
      if (result.name) { setMaintenanceAction(result.name); setMaintenanceLog([]) }
    } catch (reason) { setMaintenanceMessage(reason instanceof Error ? reason.message : 'Gateway action failed.') } finally { setMaintenanceWorking(null) }
  }
  useEffect(() => {
    if (!maintenanceAction) return
    let cancelled = false
    const poll = () => void api.getGatewayActionStatus(maintenanceAction).then(status => {
      if (cancelled) return
      setMaintenanceLog(status.lines)
      if (!status.running) setMaintenanceAction(null)
    }).catch(() => { if (!cancelled) setMaintenanceAction(null) })
    poll()
    const timer = window.setInterval(poll, 1_500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [maintenanceAction])

  return (
    <div>
      <SectionHeading icon={GlobeIcon} title={t.settings.nav.gateway} />
      <Row description={authState.status === 'authenticated' ? authState.gatewayUrl : '—'} title={g.url} />
      <Row description={authState.status === 'authenticated' ? authState.authMode : '—'} title={g.authMode} />
      <Row description={authState.status === 'authenticated' ? authState.profile : '—'} title={g.profile} />
      <Row description={connectionState} title={g.connection} />
      {gatewayVersion && <Row description={gatewayVersion} title={g.version} />}

      <div className="mt-4 rounded-lg border border-(--ui-stroke-tertiary) p-3 text-xs">
        <div className="flex items-center justify-between gap-3"><span className="font-medium text-(--ui-text-primary)">Gateway update</span><Button disabled={checkingUpdate || updating} onClick={() => void checkForUpdate()} size="sm" variant="secondary">{checkingUpdate ? 'Checking…' : 'Check'}</Button></div>
        {update ? <><div className="mt-1 text-(--ui-text-tertiary)">{update.update_available ? `${update.behind ?? 'Some'} updates available` : 'Up to date'} · {update.current_version}</div>{update.message ? <div className="mt-1 text-(--ui-text-quaternary)">{update.message}</div> : null}{update.commits?.length ? <div className="mt-2 border-t border-(--ui-stroke-tertiary) pt-2 text-[0.68rem] text-(--ui-text-quaternary)">{update.commits.slice(0, 3).map(commit => <div className="truncate" key={commit.sha}>{commit.sha.slice(0, 7)} · {commit.summary}</div>)}</div> : null}{update.update_available && update.can_apply ? <Button className="mt-3" disabled={updating} onClick={() => void applyUpdate()} size="sm">{updating ? 'Starting update…' : 'Update Gateway'}</Button> : null}</> : <div className="mt-1 text-(--ui-text-quaternary)">Update status unavailable.</div>}
      </div>

      <div className="mt-4 space-y-2">
        <Button
          className="w-full"
          disabled={restarting}
          onClick={() => {
            setRestarting(true)
            setError('')
            void api
              .restartGateway()
              .catch(err => setError(err instanceof Error ? err.message : g.restartFailed))
              .finally(() => setRestarting(false))
          }}
          variant="secondary"
        >
          {restarting && <Spinner className="size-3.5" />}
          {restarting ? g.restarting : g.restart}
        </Button>
        {error && <Caption className="text-(--ui-red)">{error}</Caption>}
        <Caption>{g.hint}</Caption>
      </div>

      <div className="mt-5 rounded-lg border border-(--ui-stroke-tertiary) p-3 text-xs">
        <div className="font-medium text-(--ui-text-primary)">Gateway maintenance</div>
        <p className="mt-1 text-(--ui-text-tertiary)">These actions run on the connected remote Gateway.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={maintenanceWorking !== null} onClick={() => void runMaintenance('doctor')} size="sm" variant="secondary">{maintenanceWorking === 'doctor' ? 'Running…' : 'Doctor'}</Button>
          <Button disabled={maintenanceWorking !== null} onClick={() => void runMaintenance('security')} size="sm" variant="secondary">{maintenanceWorking === 'security' ? 'Running…' : 'Security audit'}</Button>
          <Button disabled={maintenanceWorking !== null} onClick={() => void runMaintenance('backup')} size="sm" variant="secondary">{maintenanceWorking === 'backup' ? 'Creating…' : 'Backup'}</Button>
          <Button disabled={maintenanceWorking !== null} onClick={() => void runMaintenance('debug')} size="sm" variant="secondary">{maintenanceWorking === 'debug' ? 'Sharing…' : 'Debug share'}</Button>
        </div>
        {maintenanceMessage ? <div className="mt-3 break-all text-(--ui-text-tertiary)">{maintenanceMessage}</div> : null}
        {maintenanceAction ? <div className="mt-2 text-[0.68rem] text-(--ui-text-quaternary)">Running {maintenanceAction}…</div> : null}
        {maintenanceLog.length ? <pre className="mt-3 max-h-48 overflow-auto rounded bg-black/90 p-2 text-[0.65rem] leading-relaxed text-slate-100 whitespace-pre-wrap">{maintenanceLog.join('\n')}</pre> : null}
      </div>
    </div>
  )
}

export function BillingPage() {
  const { t } = useI18n()
  const b = t.settings.billing
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof api.getUsageAnalytics>> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void api.getUsageAnalytics().then(setAnalytics).catch(reason => setError(reason instanceof Error ? reason.message : 'Gateway usage analytics are unavailable.'))
  }, [])

  return (
    <div>
      <SectionHeading icon={BarChartIcon} title={t.settings.nav.billing} />
      <Caption className="mb-4">{b.desc}</Caption>
      {analytics ? (
        <div className="mb-4 space-y-3 rounded-lg border border-(--ui-stroke-tertiary) p-3">
          <div className="text-xs font-medium text-(--ui-text-primary)">Gateway usage · last {analytics.period_days} days</div>
          <div className="grid grid-cols-2 gap-2 text-xs"><UsageMetric label="Sessions" value={String(analytics.totals.total_sessions)} /><UsageMetric label="Input tokens" value={formatCount(analytics.totals.total_input)} /><UsageMetric label="Output tokens" value={formatCount(analytics.totals.total_output)} /><UsageMetric label="Estimated cost" value={formatCost(analytics.totals.total_estimated_cost)} /></div>
          {analytics.by_model.length ? <div className="border-t border-(--ui-stroke-tertiary) pt-2"><div className="mb-1 text-[0.68rem] text-(--ui-text-quaternary)">By model</div>{analytics.by_model.slice(0, 8).map(item => <div className="flex justify-between gap-3 py-1 text-[0.7rem]" key={`${item.provider ?? ''}:${item.model}`}><span className="min-w-0 truncate text-(--ui-text-secondary)">{item.provider ? `${item.provider} / ` : ''}{item.model}</span><span className="shrink-0 text-(--ui-text-tertiary)">{formatCost(item.actual_cost ?? item.estimated_cost ?? 0)} · {item.sessions ?? 0} sessions</span></div>)}</div> : null}
        </div>
      ) : error ? <Caption className="mb-4 text-(--ui-text-quaternary)">{error}</Caption> : <Caption className="mb-4">Loading Gateway usage…</Caption>}
      <Button onClick={() => void openExternalUrl('https://portal.nousresearch.com')} size="sm" variant="outline">
        <ExternalLinkIcon className="size-3.5" />
        {b.openPortal}
      </Button>
    </div>
  )
}

function formatCount(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat().format(value)
}

function formatCost(value: number): string {
  return `$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`
}

function UsageMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-(--ui-bg-quaternary) px-2 py-1.5"><div className="text-[0.65rem] text-(--ui-text-quaternary)">{label}</div><div className="mt-0.5 font-medium text-(--ui-text-primary)">{value}</div></div>
}

export function MiscPages({ view }: { view: 'about' | 'billing' | 'gateway' }) {
  if (view === 'about') {
    return <AboutPage />
  }

  if (view === 'billing') {
    return <BillingPage />
  }

  if (view === 'gateway') {
    return <GatewayPage />
  }

  return <GatewayPage />
}

const RELEASE_NOTES_URL = 'https://github.com/EverEcho/hermes-desktop-remote/releases'

export function AboutPage() {
  const { t } = useI18n()
  const a = t.settings.about
  const [gatewayVersion, setGatewayVersion] = useState('')

  useEffect(() => {
    void api.getStatus().then(status => setGatewayVersion(status.version ?? '')).catch(() => {})
  }, [])

  return (
    <div>
      <div className="flex flex-col items-center gap-2 pt-6 pb-4 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-(--theme-primary) text-white text-lg font-bold">R</div>
        <h2 className="text-base font-semibold tracking-tight text-(--ui-text-primary)">{a.heading}</h2>
        <Caption>{a.version(version)}</Caption>
        {gatewayVersion && <Caption>{a.gatewayVersion(gatewayVersion)}</Caption>}
      </div>
      <Button onClick={() => void openExternalUrl(RELEASE_NOTES_URL)} size="sm" variant="outline">
        <ExternalLinkIcon className="size-3.5" />
        {a.releases}
      </Button>
    </div>
  )
}
