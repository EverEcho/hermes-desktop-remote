import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $authState, initializeAuth } from '@/auth'
import { configureHttpClient } from '@/gateway/http-client'
import { connectGateway, disconnectGateway, startEventRouter, stopEventRouter } from '@/gateway'
import { loadSessionToken } from '@/auth/token-store'
import { ensureNotificationPermission, wireEventNotifications } from '@/notifications'
import { clearSessionDots } from '@/sessions/session-states'
import { LoginScreen } from '@/app/LoginScreen'
import { AppShell } from '@/app/AppShell'
import { I18nProvider, useI18n } from '@/i18n'

export function App() {
  return (
    <I18nProvider>
      <AppRoot />
    </I18nProvider>
  )
}

function AppRoot() {
  const { t } = useI18n()
  const authState = useStore($authState)
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)

  useEffect(() => {
    void initializeAuth()
  }, [])

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      disconnectGateway()
      stopEventRouter()
      clearSessionDots()

      return
    }

    let cancelled = false

    void (async () => {
      const sessionToken =
        authState.authMode === 'token' ? await loadSessionToken() : null

      if (cancelled) {
        return
      }

      configureHttpClient({
        gatewayUrl: authState.gatewayUrl,
        authMode: authState.authMode,
        sessionToken,
        profile: authState.profile
      })

      await connectGateway(authState.profile)

      if (!cancelled) {
        startEventRouter()
        wireEventNotifications()
        void ensureNotificationPermission()
      }
    })()

    return () => {
      cancelled = true
      stopEventRouter()
    }
  }, [authState])

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
    return <LoginScreen error={authState.status === 'error' ? authState.message : undefined} open />
  }

  return (
    <>
      <AppShell onChangeGateway={() => setConnectionDialogOpen(true)} />
      <LoginScreen
        initialGatewayUrl={authState.gatewayUrl}
        onClose={() => setConnectionDialogOpen(false)}
        open={connectionDialogOpen}
      />
    </>
  )
}
