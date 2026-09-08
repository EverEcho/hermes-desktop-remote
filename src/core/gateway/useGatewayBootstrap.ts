import { useEffect } from 'react'
import { useStore } from '@nanostores/react'

import { $authState, initializeAuth } from '@/auth'
import { loadSessionToken } from '@/auth/token-store'
import { connectGateway, disconnectGateway, startEventRouter, stopEventRouter } from '@/gateway'
import { configureHttpClient } from '@/gateway/http-client'
import { ensureNotificationPermission, wireEventNotifications } from '@/notifications'
import { clearSessionDots } from '@/sessions/session-states'

/**
 * Starts the authenticated Gateway workspace for whichever surface is mounted.
 * The hook deliberately owns transport lifecycle only; Desktop and Mobile keep
 * their own navigation and presentation state.
 */
export function useGatewayBootstrap() {
  const authState = useStore($authState)

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
      const sessionToken = authState.authMode === 'token' ? await loadSessionToken(authState.connectionId) : null

      if (cancelled) return

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
      // Profile/connection changes reuse this mounted hook. The old WebSocket
      // carries its original profile scope, so it must not survive into the
      // next authenticated configuration merely because it is still open.
      disconnectGateway()
    }
  }, [authState])

  return authState
}
