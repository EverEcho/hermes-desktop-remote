import { useEffect } from 'react'
import { useStore } from '@nanostores/react'

import { $authState, initializeAuth } from '@/auth'
import { configureHttpClient } from '@/gateway/http-client'
import { connectGateway, disconnectGateway, startEventRouter, stopEventRouter } from '@/gateway'
import { loadSessionToken } from '@/auth/token-store'
import { LoginScreen } from '@/app/LoginScreen'
import { AppShell } from '@/app/AppShell'

export function App() {
  const authState = useStore($authState)

  useEffect(() => {
    void initializeAuth()
  }, [])

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      disconnectGateway()
      stopEventRouter()

      return
    }

    void (async () => {
      const sessionToken =
        authState.authMode === 'token' ? await loadSessionToken() : null

      configureHttpClient({
        gatewayUrl: authState.gatewayUrl,
        authMode: authState.authMode,
        sessionToken,
        profile: authState.profile
      })

      await connectGateway(authState.profile)
      startEventRouter()
    })()

    return () => {
      stopEventRouter()
    }
  }, [authState.status, authState.status === 'authenticated' ? authState.gatewayUrl : ''])

  if (authState.status === 'unknown' || authState.status === 'authenticating') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 bg-(--ui-bg-chrome)">
        <span className="size-1.5 rounded-full bg-(--ui-accent) animate-pulse" />
        <div className="text-(--conversation-caption-font-size) text-(--ui-text-tertiary)">Connecting…</div>
      </div>
    )
  }

  if (
    authState.status === 'unauthenticated' ||
    authState.status === 'error' ||
    authState.status === 'auth-required'
  ) {
    return (
      <LoginScreen
        error={authState.status === 'error' ? authState.message : undefined}
      />
    )
  }

  return <AppShell />
}
