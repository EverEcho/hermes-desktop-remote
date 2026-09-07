import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { version } from '../../../package.json'
import { $authState } from '@/auth'
import * as api from '@/gateway/api'
import { $connectionState } from '@/gateway'
import { useI18n } from '@/i18n'
import { Button, Spinner } from '@/ui/Button'

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

  useEffect(() => {
    void api.getStatus().then(status => setGatewayVersion(status.version ?? '')).catch(() => {})
  }, [])

  return (
    <div>
      <SectionHeading icon={GlobeIcon} title={t.settings.nav.gateway} />
      <Row description={authState.status === 'authenticated' ? authState.gatewayUrl : '—'} title={g.url} />
      <Row description={authState.status === 'authenticated' ? authState.authMode : '—'} title={g.authMode} />
      <Row description={authState.status === 'authenticated' ? authState.profile : '—'} title={g.profile} />
      <Row description={connectionState} title={g.connection} />
      {gatewayVersion && <Row description={gatewayVersion} title={g.version} />}

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
    </div>
  )
}

export function BillingPage() {
  const { t } = useI18n()
  const b = t.settings.billing

  return (
    <div>
      <SectionHeading icon={BarChartIcon} title={t.settings.nav.billing} />
      <Caption className="mb-4">{b.desc}</Caption>
      <Button onClick={() => window.open('https://portal.nousresearch.com', '_blank')} size="sm" variant="outline">
        <ExternalLinkIcon className="size-3.5" />
        {b.openPortal}
      </Button>
    </div>
  )
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
      <Button onClick={() => window.open(RELEASE_NOTES_URL, '_blank')} size="sm" variant="outline">
        <ExternalLinkIcon className="size-3.5" />
        {a.releases}
      </Button>
    </div>
  )
}
