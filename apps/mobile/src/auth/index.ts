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
  type StoredConnection
} from './token-store'
import { gatewayTargetHeaders, resolveGatewayRequestUrl } from '@/gateway/request-url'

export type AuthState =
  | { status: 'unknown' }
  | { status: 'unauthenticated' }
  | { status: 'authenticating' }
  | { status: 'authenticated'; gatewayUrl: string; authMode: 'oauth' | 'token' | 'cookie'; profile: string }
  | { status: 'auth-required' }
  | { status: 'error'; message: string }

export const $authState = atom<AuthState>({ status: 'unknown' })

let refreshTimer: ReturnType<typeof setTimeout> | null = null

interface LoginTransaction {
  pkce: PkceChallenge
  gatewayUrl: string
  profile: string
  listener: { remove: () => Promise<void> } | null
  timeout: ReturnType<typeof setTimeout> | null
  settled: boolean
}

let activeLogin: LoginTransaction | null = null

function cleanupLoginTransaction(): void {
  if (!activeLogin) {
    return
  }

  activeLogin.settled = true

  if (activeLogin.listener) {
    void activeLogin.listener.remove()
    activeLogin.listener = null
  }

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
    const token = await loadSessionToken()

    if (!token) {
      $authState.set({ status: 'unauthenticated' })

      return
    }

    $authState.set({
      status: 'authenticated',
      gatewayUrl: conn.gatewayUrl,
      authMode: 'token',
      profile: conn.profile
    })

    return
  }

  if (conn.authMode === 'cookie') {
    $authState.set({ status: 'authenticated', gatewayUrl: conn.gatewayUrl, authMode: 'cookie', profile: conn.profile })
    return
  }

  const creds = await loadCredentials()

  if (!creds) {
    $authState.set({ status: 'unauthenticated' })

    return
  }

  if (isTokenExpiringSoon(creds.expiresAt)) {
    try {
      await doRefresh(conn.gatewayUrl, creds.refreshToken, creds.provider)
    } catch {
      $authState.set({ status: 'unauthenticated' })

      return
    }
  }

  $authState.set({
    status: 'authenticated',
    gatewayUrl: conn.gatewayUrl,
    authMode: 'oauth',
    profile: conn.profile
  })

  scheduleRefresh(conn.gatewayUrl)
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
      timeout: null,
      settled: false
    }

    activeLogin = tx

    tx.listener = await App.addListener('appUrlOpen', ({ url }) => {
      void handleOAuthCallback(url)
    })

    tx.timeout = setTimeout(() => {
      if (activeLogin === tx && !tx.settled) {
        cleanupLoginTransaction()
        $authState.set({ status: 'error', message: 'Login timed out — try again.' })
      }
    }, 120_000)

    const authUrl = buildAuthorizeUrl(gatewayUrl, pkce.challenge, pkce.state)
    await Browser.open({ url: authUrl })
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

  if (!tx || tx.settled) {
    return
  }

  const callback = parseOAuthCallback(url)

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

    await saveCredentials({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      provider: tokens.provider,
      userId: tokens.userId
    })

    await saveConnection({ gatewayUrl: tx.gatewayUrl, authMode: 'oauth', profile: tx.profile })

    $authState.set({
      status: 'authenticated',
      gatewayUrl: tx.gatewayUrl,
      authMode: 'oauth',
      profile: tx.profile
    })

    scheduleRefresh(tx.gatewayUrl)
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
    const response = await fetch(`${base}/api/sessions?limit=1&offset=0&min_messages=1&archived=exclude&order=recent`, {
      headers: { 'X-Hermes-Session-Token': token, ...gatewayTargetHeaders(gatewayUrl) }
    })

    if (!response.ok) {
      throw new Error(`Connection failed (${response.status})`)
    }

    await saveSessionToken(token)
    await saveConnection({ gatewayUrl, authMode: 'token', profile, sessionToken: token })

    $authState.set({ status: 'authenticated', gatewayUrl, authMode: 'token', profile })
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
    const base = resolveGatewayRequestUrl(gatewayUrl)
    const response = await fetch(`${base}/api/sessions?limit=1&offset=0&min_messages=1&archived=exclude&order=recent`, {
      credentials: 'include',
      headers: gatewayTargetHeaders(gatewayUrl)
    })

    if (!response.ok) throw new Error(`Connection failed (${response.status})`)
    await saveConnection({ gatewayUrl, authMode: 'cookie', profile })
    $authState.set({ status: 'authenticated', gatewayUrl, authMode: 'cookie', profile })
  } catch (error) {
    $authState.set({ status: 'error', message: error instanceof Error ? error.message : 'Cookie sign-in failed' })
  }
}

export async function logout(): Promise<void> {
  cleanupLoginTransaction()

  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  await clearAllAuth()
  $authState.set({ status: 'unauthenticated' })
}

export async function getAccessToken(): Promise<string | null> {
  const state = $authState.get()

  if (state.status !== 'authenticated') {
    return null
  }

  if (state.authMode === 'token') {
    return loadSessionToken()
  }

  const creds = await loadCredentials()

  if (!creds) {
    return null
  }

  if (isTokenExpiringSoon(creds.expiresAt)) {
    try {
      await doRefresh(state.gatewayUrl, creds.refreshToken, creds.provider)

      return (await loadCredentials())?.accessToken ?? null
    } catch {
      return null
    }
  }

  return creds.accessToken
}

export async function getWsTicket(gatewayUrl: string): Promise<string> {
  const creds = await loadCredentials()

  if (!creds) {
    throw new Error('No credentials available')
  }

  if (isTokenExpiringSoon(creds.expiresAt)) {
    await doRefresh(gatewayUrl, creds.refreshToken, creds.provider)
  }

  const fresh = await loadCredentials()

  if (!fresh) {
    throw new Error('Credentials lost during refresh')
  }

  return requestWsTicket(gatewayUrl, fresh.accessToken)
}

async function doRefresh(gatewayUrl: string, refreshToken: string, provider: string): Promise<void> {
  const tokens = await refreshAccessToken(gatewayUrl, refreshToken, provider)

  await saveCredentials({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    provider: tokens.provider,
    userId: tokens.userId
  })
}

function scheduleRefresh(gatewayUrl: string): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }

  void (async () => {
    const creds = await loadCredentials()

    if (!creds) {
      return
    }

    const nowSeconds = Date.now() / 1000
    const delaySeconds = Math.max(0, creds.expiresAt - nowSeconds - 60)
    const delayMs = delaySeconds * 1000

    refreshTimer = setTimeout(() => {
      void doRefresh(gatewayUrl, creds.refreshToken, creds.provider)
        .then(() => scheduleRefresh(gatewayUrl))
        .catch(error => {
          if (error instanceof TokenRefreshAuthError) {
            $authState.set({ status: 'auth-required' })
          } else {
            scheduleRefresh(gatewayUrl)
          }
        })
    }, delayMs)
  })()
}

export async function checkGatewayStatus(
  gatewayUrl: string
): Promise<{ authMode: 'oauth' | 'token'; providers: Array<{ name: string; displayName: string; supportsPassword: boolean }> }> {
  const base = resolveGatewayRequestUrl(gatewayUrl)
  const response = await fetch(`${base}/api/status`, { headers: gatewayTargetHeaders(gatewayUrl) })

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
      const providerResponse = await fetch(`${base}/api/auth/providers`, { headers: gatewayTargetHeaders(gatewayUrl) })
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
