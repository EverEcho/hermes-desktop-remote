import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { version } from '../../../package.json'
import { $authState } from '@/auth'
import * as api from '@/gateway/api'
import { $connectionState } from '@/gateway'
import { useI18n } from '@/i18n'
import { Button, Spinner } from '@/ui/Button'

import { KEYBIND_REFERENCE } from '../constants'
import { BarChartIcon, ExternalLinkIcon, GlobeIcon, KeyboardIcon, PackageIcon } from '../icons'
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

export function KeybindsPage() {
  const { t } = useI18n()
  const k = t.settings.keybinds
  const categories: ('general' | 'composer' | 'sessions')[] = ['general', 'composer', 'sessions']

  return (
    <div>
      <SectionHeading icon={KeyboardIcon} title={t.settings.nav.keybinds} />
      <Caption className="mb-2">{k.intro}</Caption>
      {categories.map(category => (
        <div key={category}>
          <p className="pt-3 pb-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)">
            {k.categories[category]}
          </p>
          {KEYBIND_REFERENCE.filter(item => item.category === category).map(item => (
            <div className="flex items-center justify-between gap-3 py-2" key={item.id}>
              <span className="text-(--conversation-text-font-size) text-(--ui-text-primary)">
                {k.items[item.id as keyof typeof k.items]}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {item.keys.map(key => (
                  <kbd
                    className="rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-1.5 py-0.5 text-[0.625rem] font-mono text-(--ui-text-secondary)"
                    key={key}
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
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

export function PluginsPage() {
  const { t } = useI18n()
  const p = t.settings.plugins

  return (
    <div>
      <SectionHeading icon={PackageIcon} title={t.settings.nav.plugins} />
      <Caption className="mb-2">{p.desc}</Caption>
      <Caption>{p.empty}</Caption>
    </div>
  )
}

export function MiscPages({ view }: { view: 'about' | 'billing' | 'gateway' | 'keybinds' | 'plugins' }) {
  if (view === 'about') {
    return <AboutPage />
  }

  if (view === 'billing') {
    return <BillingPage />
  }

  if (view === 'gateway') {
    return <GatewayPage />
  }

  if (view === 'keybinds') {
    return <KeybindsPage />
  }

  return <PluginsPage />
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
