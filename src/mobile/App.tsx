import { useState } from 'react'

import type { AppSurface } from '@/bootstrap/runtime'
import { AppSurfaceProvider } from '@/bootstrap/surface-context'
import { AppShell } from '@/app/AppShell'
import { LoginScreen } from '@/app/LoginScreen'
import { useGatewayBootstrap } from '@/core/gateway/useGatewayBootstrap'
import { I18nProvider, useI18n } from '@/i18n'

export function MobileApp({ surface = 'mobile' }: { surface?: AppSurface }) {
  return (
    <>
      <div className="tauri-titlebar" data-tauri-drag-region aria-hidden="true" />
      <AppSurfaceProvider surface={surface}>
        <I18nProvider>
          <AppRoot surface={surface} />
        </I18nProvider>
      </AppSurfaceProvider>
    </>
  )
}

function AppRoot({ surface }: { surface: AppSurface }) {
  const { t } = useI18n()
  const authState = useGatewayBootstrap()
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)

  if (authState.status === 'unknown' || authState.status === 'authenticating') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 bg-(--ui-bg-chrome)">
        <span className="size-1.5 rounded-full bg-(--ui-accent) animate-pulse" />
        <div className="text-(--conversation-caption-font-size) text-(--ui-text-tertiary)">{t.app.connecting}</div>
      </div>
    )
  }

  const needsConnection =
    authState.status === 'unauthenticated' ||
    authState.status === 'error' ||
    authState.status === 'auth-required'

  if (needsConnection) {
    return (
      <LoginScreen
        error={authState.status === 'error' ? authState.message : undefined}
        initialGatewayUrl={authState.status === 'unauthenticated' ? authState.gatewayUrl : undefined}
        open
      />
    )
  }

  return (
    <>
      <AppShell surface={surface} onChangeGateway={() => setConnectionDialogOpen(true)} />
      <LoginScreen
        initialGatewayUrl={authState.gatewayUrl}
        onClose={() => setConnectionDialogOpen(false)}
        open={connectionDialogOpen}
      />
    </>
  )
}
