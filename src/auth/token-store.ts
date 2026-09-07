import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { Preferences } from '@capacitor/preferences'

import { isNativePlatform } from '@/native'

const SECURE_KEYS = {
  credentials: 'rhermes.creds',
  sessionToken: 'rhermes.session_token'
} as const

const CONFIG_KEYS = {
  gatewayUrl: 'rhermes.config.gateway_url',
  authMode: 'rhermes.config.auth_mode',
  profile: 'rhermes.config.profile'
} as const

export interface StoredCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  provider: string
  userId: string
}

export interface StoredConnection {
  gatewayUrl: string
  authMode: 'oauth' | 'token' | 'cookie'
  profile: string
  sessionToken?: string
}

export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  await SecureStorage.set(SECURE_KEYS.credentials, JSON.stringify(creds))
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const raw = await SecureStorage.get(SECURE_KEYS.credentials)

  if (raw === null) {
    return null
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw

    return parsed as StoredCredentials
  } catch {
    await SecureStorage.remove(SECURE_KEYS.credentials)

    return null
  }
}

export async function saveSessionToken(token: string): Promise<void> {
  if (!isNativePlatform()) {
    window.sessionStorage.setItem(SECURE_KEYS.sessionToken, token)

    return
  }

  await SecureStorage.set(SECURE_KEYS.sessionToken, token)
}

export async function loadSessionToken(): Promise<string | null> {
  if (!isNativePlatform()) {
    return window.sessionStorage.getItem(SECURE_KEYS.sessionToken)
  }

  const raw = await SecureStorage.get(SECURE_KEYS.sessionToken)

  if (raw === null) {
    return null
  }

  return typeof raw === 'string' ? raw : null
}

export async function saveConnection(conn: StoredConnection): Promise<void> {
  await Promise.all([
    Preferences.set({ key: CONFIG_KEYS.gatewayUrl, value: conn.gatewayUrl }),
    Preferences.set({ key: CONFIG_KEYS.authMode, value: conn.authMode }),
    Preferences.set({ key: CONFIG_KEYS.profile, value: conn.profile })
  ])

  if (conn.sessionToken) {
    await saveSessionToken(conn.sessionToken)
  }
}

export async function loadConnection(): Promise<StoredConnection | null> {
  const [gatewayUrl, authMode, profile] = await Promise.all([
    Preferences.get({ key: CONFIG_KEYS.gatewayUrl }),
    Preferences.get({ key: CONFIG_KEYS.authMode }),
    Preferences.get({ key: CONFIG_KEYS.profile })
  ])

  if (!gatewayUrl?.value) {
    return null
  }

  const sessionToken = await loadSessionToken()

  return {
    gatewayUrl: gatewayUrl.value,
    authMode: (authMode?.value as 'oauth' | 'token' | 'cookie') ?? 'token',
    profile: profile?.value ?? 'default',
    sessionToken: sessionToken ?? undefined
  }
}

export function isTokenExpiringSoon(expiresAt: number, bufferSeconds = 60): boolean {
  if (!expiresAt || !Number.isFinite(expiresAt)) {
    return true
  }

  const nowSeconds = Date.now() / 1000

  return nowSeconds >= expiresAt - bufferSeconds
}

export async function clearAllAuth(): Promise<void> {
  if (!isNativePlatform()) {
    window.sessionStorage.removeItem(SECURE_KEYS.sessionToken)
  }

  await Promise.all([
    SecureStorage.remove(SECURE_KEYS.credentials),
    SecureStorage.remove(SECURE_KEYS.sessionToken),
    Preferences.remove({ key: CONFIG_KEYS.gatewayUrl }),
    Preferences.remove({ key: CONFIG_KEYS.authMode }),
    Preferences.remove({ key: CONFIG_KEYS.profile })
  ])
}
