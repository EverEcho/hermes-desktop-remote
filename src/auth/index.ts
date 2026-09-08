import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { atom } from 'nanostores'

import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  generatePkceChallenge,
  parseOAuthCallback,
  refreshAccessToken,
  requestWsTicket,
  TokenRefreshAuthError,
  type PkceChallenge
} from './pkce'
import {
  clearAllAuth,
  isTokenExpiringSoon,
  loadConnection,
  loadCredentials,
  loadSessionToken,
  saveConnection,
  saveCredentials,
  saveSessionToken,
  selectConnection,
  type StoredConnection
} from './token-store'
import { gatewayTargetHeaders, resolveGatewayRequestUrl } from '@/gateway/request-url'
import { gatewayFetch } from '@/gateway/fetch'
import { isMobileNativePlatform, isTauriPlatform, openExternalUrl } from '@/native'
import {
  closeEmbeddedLoopbackOAuth,
  createEmbeddedLoopbackRedirectUri,
  openEmbeddedLoopbackOAuth,
  supportsEmbeddedLoopbackOAuth
} from '@/native/oauth-webview'

type TauriUnlisten = () => void

export type AuthState =
  | { status: 'unknown' }
  | { status: 'unauthenticated'; connectionId?: string; gatewayUrl?: string; profile?: string }
  | { status: 'authenticating' }
  | { status: 'authenticated'; connectionId: string; gatewayUrl: string; authMode: 'oauth' | 'token' | 'cookie'; profile: string }
  | { status: 'auth-required' }
  | { status: 'error'; message: string }

export const $authState = atom<AuthState>({ status: 'unknown' })

let refreshTimer: ReturnType<typeof setTimeout> | null = null

interface LoginTransaction {
  pkce: PkceChallenge
  gatewayUrl: string
  profile: string
  listener: { remove: () => Promise<void> } | null
  tauriUnlisten: TauriUnlisten | null
  redirectUri: string | null
  timeout: ReturnType<typeof setTimeout> | null
  settled: boolean
}

let activeLogin: LoginTransaction | null = null

function unauthenticatedConnection(connection?: StoredConnection): AuthState {
  return connection
    ? { status: 'unauthenticated', connectionId: connection.id, gatewayUrl: connection.gatewayUrl, profile: connection.profile }
    : { status: 'unauthenticated' }
}

function cleanupLoginTransaction(): void {
  if (!activeLogin) {
    return
  }

  activeLogin.settled = true

  if (activeLogin.listener) {
    void activeLogin.listener.remove()
    activeLogin.listener = null
  }

  if (activeLogin.tauriUnlisten) {
    activeLogin.tauriUnlisten()
    activeLogin.tauriUnlisten = null
  }

  if (isTauriPlatform()) {
    const expectedState = activeLogin.pkce.state
    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('cancel_oauth_loopback', { expectedState }).catch(() => {})
    )
  }

  void closeEmbeddedLoopbackOAuth()

  if (activeLogin.timeout) {
    clearTimeout(activeLogin.timeout)
    activeLogin.timeout = null
  }

  activeLogin = null
}

export async function initializeAuth(): Promise<void> {
  const conn = await loadConnection()

  if (!conn) {
    $authState.set({ status: 'unauthenticated' })

    return
  }

  if (conn.authMode === 'token') {
    const token = await loadSessionToken(conn.id)

    if (!token) {
      $authState.set(unauthenticatedConnection(conn))

      return
    }

    $authState.set({
      status: 'authenticated',
      gatewayUrl: conn.gatewayUrl,
      authMode: 'token',
      connectionId: conn.id,
      profile: conn.profile
    })

    return
  }

  if (conn.authMode === 'cookie') {
    try {
      await verifyCookieSession(conn.gatewayUrl)
      $authState.set({ status: 'authenticated', connectionId: conn.id, gatewayUrl: conn.gatewayUrl, authMode: 'cookie', profile: conn.profile })
    } catch {
      // The persisted connection only records the gateway URL; the browser
      // session cookie itself can expire or be cleared. Do not reconnect the
      // WebSocket against a known-invalid cookie and leave it in a retry loop.
      $authState.set(unauthenticatedConnection(conn))
    }
    return
  }

  const creds = await loadCredentials(conn.id)

  if (!creds) {
    $authState.set(unauthenticatedConnection(conn))

    return
  }

  if (isTokenExpiringSoon(creds.expiresAt)) {
    try {
      await doRefresh(conn.gatewayUrl, creds.refreshToken, creds.provider, conn.id)
    } catch {
      $authState.set(unauthenticatedConnection(conn))

      return
    }
  }

  $authState.set({
    status: 'authenticated',
    gatewayUrl: conn.gatewayUrl,
    authMode: 'oauth',
    connectionId: conn.id,
    profile: conn.profile
  })

  scheduleRefresh(conn.gatewayUrl, conn.id)
}

export async function startOAuthLogin(gatewayUrl: string, profile = 'default'): Promise<void> {
  cleanupLoginTransaction()

  try {
    const pkce = await generatePkceChallenge()

    const tx: LoginTransaction = {
      pkce,
      gatewayUrl,
      profile,
      listener: null,
      tauriUnlisten: null,
      redirectUri: null,
      timeout: null,
      settled: false
    }

    activeLogin = tx

    if (isTauriPlatform()) {
      const [{ invoke }, { listen }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/event')
      ])
      tx.tauriUnlisten = await listen<string>('oauth-loopback-callback', ({ payload }) => {
        void handleOAuthCallback(payload)
      })
      tx.redirectUri = await invoke<string>('start_oauth_loopback', {
        expectedState: pkce.state
      })
    } else if (supportsEmbeddedLoopbackOAuth()) {
      tx.redirectUri = createEmbeddedLoopbackRedirectUri()
    } else {
      tx.listener = await App.addListener('appUrlOpen', ({ url }) => {
        void handleOAuthCallback(url)
      })
    }

    tx.timeout = setTimeout(() => {
      if (activeLogin === tx && !tx.settled) {
        cleanupLoginTransaction()
        $authState.set({ status: 'error', message: 'Login timed out — try again.' })
      }
    }, 300_000)

    if (!tx.redirectUri) {
      throw new Error('Native OAuth requires a loopback callback URL')
    }

    const authUrl = buildAuthorizeUrl(gatewayUrl, pkce.challenge, pkce.state, tx.redirectUri)
    if (isTauriPlatform() && tx.redirectUri) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_oauth_webview', {
        authorizeUrl: authUrl,
        redirectUri: tx.redirectUri
      })
    } else if (isMobileNativePlatform() && tx.redirectUri) {
      const callbackUrl = await openEmbeddedLoopbackOAuth(authUrl, tx.redirectUri)
      await handleOAuthCallback(callbackUrl)
    } else {
      await openExternalUrl(authUrl)
    }
  } catch (error) {
    cleanupLoginTransaction()
    $authState.set({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to start OAuth login'
    })
  }
}

async function handleOAuthCallback(url: string): Promise<void> {
  const tx = activeLogin

  if (!tx || tx.settled || !tx.redirectUri) {
    return
  }

  const callback = parseOAuthCallback(url, tx.redirectUri)

  if (!callback) {
    return
  }

  if (callback.state !== tx.pkce.state) {
    cleanupLoginTransaction()
    await Browser.close().catch(() => {})
    $authState.set({ status: 'error', message: 'OAuth state mismatch — login cancelled.' })

    return
  }

  cleanupLoginTransaction()
  await Browser.close().catch(() => {})

  try {
    const tokens = await exchangeCodeForTokens(tx.gatewayUrl, callback.code, tx.pkce.verifier)

    const connection = await saveConnection({ gatewayUrl: tx.gatewayUrl, authMode: 'oauth', profile: tx.profile })

    await saveCredentials({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      provider: tokens.provider,
      userId: tokens.userId
    }, connection.id)

    $authState.set({
      status: 'authenticated',
      connectionId: connection.id,
      gatewayUrl: connection.gatewayUrl,
      authMode: 'oauth',
      profile: tx.profile
    })

    scheduleRefresh(tx.gatewayUrl, connection.id)
  } catch (error) {
    $authState.set({
      status: 'error',
      message: error instanceof Error ? error.message : 'Token exchange failed'
    })
  }
}

export async function loginWithToken(
  gatewayUrl: string,
  token: string,
  profile = 'default'
): Promise<void> {
  $authState.set({ status: 'authenticating' })

  try {
    const base = resolveGatewayRequestUrl(gatewayUrl)
    // /api/status is public, so a 200 there says nothing about the supplied
    // token. Validate against a protected endpoint before persisting it.
    const response = await gatewayFetch(`${base}/api/sessions?limit=1&offset=0&min_messages=1&archived=exclude&order=recent`, {
      headers: { 'X-Hermes-Session-Token': token, ...gatewayTargetHeaders(gatewayUrl) }
    })

    if (!response.ok) {
      throw new Error(`Connection failed (${response.status})`)
    }

    const connection = await saveConnection({ gatewayUrl, authMode: 'token', profile })
    await saveSessionToken(token, connection.id)

    $authState.set({ status: 'authenticated', connectionId: connection.id, gatewayUrl: connection.gatewayUrl, authMode: 'token', profile })
  } catch (error) {
    $authState.set({
      status: 'error',
      message: error instanceof Error ? error.message : 'Connection failed'
    })
  }
}

export async function loginWithCookie(gatewayUrl: string, profile = 'default'): Promise<void> {
  $authState.set({ status: 'authenticating' })

  try {
    await verifyCookieSession(gatewayUrl)
    const connection = await saveConnection({ gatewayUrl, authMode: 'cookie', profile })
    $authState.set({ status: 'authenticated', connectionId: connection.id, gatewayUrl: connection.gatewayUrl, authMode: 'cookie', profile })
  } catch (error) {
    $authState.set({ status: 'error', message: error instanceof Error ? error.message : 'Cookie sign-in failed' })
  }
}

async function verifyCookieSession(gatewayUrl: string): Promise<void> {
  const base = resolveGatewayRequestUrl(gatewayUrl)
  const response = await gatewayFetch(`${base}/api/sessions?limit=1&offset=0&min_messages=1&archived=exclude&order=recent`, {
    credentials: 'include',
    headers: gatewayTargetHeaders(gatewayUrl)
  })

  if (!response.ok) {
    throw new Error(`Connection failed (${response.status})`)
  }
}

export async function logout(): Promise<void> {
  cleanupLoginTransaction()

  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  const state = $authState.get()
  const connectionId = state.status === 'authenticated' ? state.connectionId : undefined
  await clearAllAuth(connectionId)
  $authState.set(state.status === 'authenticated'
    ? { status: 'unauthenticated', connectionId: state.connectionId, gatewayUrl: state.gatewayUrl, profile: state.profile }
    : { status: 'unauthenticated' })
}

/**
 * Re-homes the client onto another persisted remote Gateway. No local process
 * is started; the gateway bootstrap hook observes this state transition and
 * rebuilds only the socket-bound workspace.
 */
export async function switchConnection(connectionId: string): Promise<void> {
  cleanupLoginTransaction()
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  const { clearSessionLists, closeSession } = await import('@/sessions/store')
  closeSession()
  clearSessionLists()
  await selectConnection(connectionId)
  $authState.set({ status: 'unknown' })
  await initializeAuth()
}

/** Profiles are server-side namespaces on the active remote Gateway. */
export async function switchProfile(profile: string): Promise<void> {
  const state = $authState.get()

  if (state.status !== 'authenticated') {
    throw new Error('Authentication required')
  }

  const nextProfile = profile.trim() || 'default'
  if (nextProfile === state.profile) return

  const connection = await saveConnection({
    authMode: state.authMode,
    gatewayUrl: state.gatewayUrl,
    id: state.connectionId,
    profile: nextProfile
  })

  // A transcript belongs to the previous server-side profile. Clear its
  // in-memory runtime before the bootstrap reconnects, so profile A can never
  // briefly render under profile B while the new session index loads.
  const { clearSessionLists, closeSession } = await import('@/sessions/store')
  closeSession()
  clearSessionLists()

  // The shared gateway bootstrap observes this atom update and recreates its
  // HTTP + WebSocket clients under the selected profile. No local process is
  // started for profile switching.
  $authState.set({ ...state, gatewayUrl: connection.gatewayUrl, profile: connection.profile })
}

export async function getAccessToken(): Promise<string | null> {
  const state = $authState.get()

  if (state.status !== 'authenticated') {
    return null
  }

  if (state.authMode === 'token') {
    return loadSessionToken(state.connectionId)
  }

  const creds = await loadCredentials(state.connectionId)

  if (!creds) {
    return null
  }

  if (isTokenExpiringSoon(creds.expiresAt)) {
    try {
      await doRefresh(state.gatewayUrl, creds.refreshToken, creds.provider, state.connectionId)

      return (await loadCredentials(state.connectionId))?.accessToken ?? null
    } catch {
      return null
    }
  }

  return creds.accessToken
}

export async function getWsTicket(gatewayUrl: string): Promise<string> {
  const state = $authState.get()
  const connectionId = state.status === 'authenticated' ? state.connectionId : undefined
  const creds = await loadCredentials(connectionId)

  if (!creds) {
    throw new Error('No credentials available')
  }

  if (isTokenExpiringSoon(creds.expiresAt)) {
    await doRefresh(gatewayUrl, creds.refreshToken, creds.provider, connectionId)
  }

  const fresh = await loadCredentials(connectionId)

  if (!fresh) {
    throw new Error('Credentials lost during refresh')
  }

  return requestWsTicket(gatewayUrl, fresh.accessToken)
}

async function doRefresh(gatewayUrl: string, refreshToken: string, provider: string, connectionId?: string): Promise<void> {
  const tokens = await refreshAccessToken(gatewayUrl, refreshToken, provider)

  await saveCredentials({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    provider: tokens.provider,
    userId: tokens.userId
  }, connectionId)
}

function scheduleRefresh(gatewayUrl: string, connectionId: string): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }

  void (async () => {
    const creds = await loadCredentials(connectionId)

    if (!creds) {
      return
    }

    const nowSeconds = Date.now() / 1000
    const delaySeconds = Math.max(0, creds.expiresAt - nowSeconds - 60)
    const delayMs = delaySeconds * 1000

    refreshTimer = setTimeout(() => {
      void doRefresh(gatewayUrl, creds.refreshToken, creds.provider, connectionId)
        .then(() => scheduleRefresh(gatewayUrl, connectionId))
        .catch(error => {
          if (error instanceof TokenRefreshAuthError) {
            $authState.set({ status: 'auth-required' })
          } else {
            scheduleRefresh(gatewayUrl, connectionId)
          }
        })
    }, delayMs)
  })()
}

export async function checkGatewayStatus(
  gatewayUrl: string
): Promise<{ authMode: 'oauth' | 'token'; providers: Array<{ name: string; displayName: string; supportsPassword: boolean }> }> {
  const base = resolveGatewayRequestUrl(gatewayUrl)
  const response = await gatewayFetch(`${base}/api/status`, { headers: gatewayTargetHeaders(gatewayUrl) })

  if (!response.ok) {
    throw new Error(`Gateway unreachable (${response.status})`)
  }

  const data = (await response.json()) as {
    auth_required?: boolean
  }

  const authMode = data.auth_required ? 'oauth' : 'token'
  let providers: Array<{ name: string; displayName: string; supportsPassword: boolean }> = []

  if (authMode === 'oauth') {
    try {
      const providerResponse = await gatewayFetch(`${base}/api/auth/providers`, { headers: gatewayTargetHeaders(gatewayUrl) })
      const providerBody = (await providerResponse.json()) as { providers?: Array<Record<string, unknown>> }
      providers = (providerBody.providers ?? [])
        .filter(provider => typeof provider?.name === 'string' && provider.name)
        .map(provider => ({
          name: String(provider.name),
          displayName: String(provider.display_name ?? provider.name),
          supportsPassword: Boolean(provider.supports_password)
        }))
    } catch {
      // Provider labels are optional metadata; the authentication mode is known.
    }
  }

  return { authMode, providers }
}

export type { StoredConnection }
