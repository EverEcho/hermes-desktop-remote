import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { Preferences } from '@capacitor/preferences'

import {
  addRemoteGatewayConnection,
  createEmptyRemoteGatewayRegistry,
  getActiveRemoteGatewayConnection,
  normalizeGatewayUrl,
  parseRemoteGatewayRegistry,
  selectRemoteGatewayConnection,
  updateRemoteGatewayConnection,
  type GatewayAuthMode,
  type RemoteGatewayRegistry
} from '@/core/connections/registry'
import { isNativePlatform } from '@/native'

const PRIMARY_CONNECTION_ID = 'primary'
const REGISTRY_KEY = 'rhermes.connections.v1'

const LEGACY_SECURE_KEYS = {
  credentials: 'rhermes.creds',
  sessionToken: 'rhermes.session_token'
} as const

const LEGACY_CONFIG_KEYS = {
  gatewayUrl: 'rhermes.config.gateway_url',
  authMode: 'rhermes.config.auth_mode',
  profile: 'rhermes.config.profile'
} as const

export interface StoredCredentials {
  accessToken: string
  expiresAt: number
  provider: string
  refreshToken: string
  userId: string
}

export interface StoredConnection {
  authMode: GatewayAuthMode
  gatewayUrl: string
  id: string
  profile: string
  sessionToken?: string
}

export type StoredConnectionInput = Omit<StoredConnection, 'id'> & { id?: string }

function scopedSecureKey(key: string, connectionId: string): string {
  return `${key}.${encodeURIComponent(connectionId)}`
}

function normalizeConnectionId(value: string | undefined): string {
  return value?.trim() || PRIMARY_CONNECTION_ID
}

function createConnectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `gateway-${crypto.randomUUID()}`
  }

  return `gateway-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function parseCredentials(raw: unknown): StoredCredentials | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.accessToken !== 'string' || !value.accessToken) return null

  return {
    accessToken: value.accessToken,
    expiresAt: typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt) ? value.expiresAt : 0,
    provider: typeof value.provider === 'string' ? value.provider : '',
    refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : '',
    userId: typeof value.userId === 'string' ? value.userId : ''
  }
}

async function loadCredentialsForKey(key: string): Promise<StoredCredentials | null> {
  const raw = await SecureStorage.get(key)
  if (raw === null) return null

  try {
    const credentials = parseCredentials(typeof raw === 'string' ? JSON.parse(raw) : raw)
    if (credentials) return credentials
  } catch {
    // Fall through to remove malformed secrets.
  }

  await SecureStorage.remove(key)
  return null
}

export async function saveCredentials(creds: StoredCredentials, connectionId = PRIMARY_CONNECTION_ID): Promise<void> {
  await SecureStorage.set(scopedSecureKey(LEGACY_SECURE_KEYS.credentials, normalizeConnectionId(connectionId)), JSON.stringify(creds))
}

export async function loadCredentials(connectionId = PRIMARY_CONNECTION_ID): Promise<StoredCredentials | null> {
  const id = normalizeConnectionId(connectionId)
  const scoped = await loadCredentialsForKey(scopedSecureKey(LEGACY_SECURE_KEYS.credentials, id))
  if (scoped || id !== PRIMARY_CONNECTION_ID) return scoped

  // v0 stored a single global credential. Only the migrated primary route may
  // consume it; no other connection can accidentally inherit this secret.
  return loadCredentialsForKey(LEGACY_SECURE_KEYS.credentials)
}

export async function saveSessionToken(token: string, connectionId = PRIMARY_CONNECTION_ID): Promise<void> {
  const id = normalizeConnectionId(connectionId)
  const key = scopedSecureKey(LEGACY_SECURE_KEYS.sessionToken, id)

  if (!isNativePlatform()) {
    window.sessionStorage.setItem(key, token)
    return
  }

  await SecureStorage.set(key, token)
}

export async function loadSessionToken(connectionId = PRIMARY_CONNECTION_ID): Promise<string | null> {
  const id = normalizeConnectionId(connectionId)
  const key = scopedSecureKey(LEGACY_SECURE_KEYS.sessionToken, id)

  if (!isNativePlatform()) {
    return window.sessionStorage.getItem(key) ??
      (id === PRIMARY_CONNECTION_ID ? window.sessionStorage.getItem(LEGACY_SECURE_KEYS.sessionToken) : null)
  }

  const scoped = await SecureStorage.get(key)
  if (typeof scoped === 'string') return scoped
  if (id !== PRIMARY_CONNECTION_ID) return null

  const legacy = await SecureStorage.get(LEGACY_SECURE_KEYS.sessionToken)
  return typeof legacy === 'string' ? legacy : null
}

async function migrateLegacyRegistry(): Promise<RemoteGatewayRegistry> {
  const [gatewayUrl, authMode, profile] = await Promise.all([
    Preferences.get({ key: LEGACY_CONFIG_KEYS.gatewayUrl }),
    Preferences.get({ key: LEGACY_CONFIG_KEYS.authMode }),
    Preferences.get({ key: LEGACY_CONFIG_KEYS.profile })
  ])

  if (!gatewayUrl.value) return createEmptyRemoteGatewayRegistry()

  const savedAuthMode = authMode.value
  const connectionAuthMode: GatewayAuthMode =
    savedAuthMode === 'cookie' || savedAuthMode === 'oauth' || savedAuthMode === 'token' ? savedAuthMode : 'token'

  try {
    const registry = addRemoteGatewayConnection(
      createEmptyRemoteGatewayRegistry(),
      { authMode: connectionAuthMode, baseUrl: gatewayUrl.value, profile: profile.value ?? 'default' },
      { id: PRIMARY_CONNECTION_ID, now: Date.now() }
    )
    await Preferences.set({ key: REGISTRY_KEY, value: JSON.stringify(registry) })
    return registry
  } catch {
    return createEmptyRemoteGatewayRegistry()
  }
}

export async function loadRemoteGatewayRegistry(): Promise<RemoteGatewayRegistry> {
  const saved = await Preferences.get({ key: REGISTRY_KEY })
  if (saved.value === null) return migrateLegacyRegistry()

  try {
    return parseRemoteGatewayRegistry(JSON.parse(saved.value)) ?? createEmptyRemoteGatewayRegistry()
  } catch {
    return createEmptyRemoteGatewayRegistry()
  }
}

export async function saveRemoteGatewayRegistry(registry: RemoteGatewayRegistry): Promise<void> {
  await Preferences.set({ key: REGISTRY_KEY, value: JSON.stringify(registry) })
}

/**
 * Writes a connection into the remote-only registry and selects it for the
 * next bootstrap. Existing routes retain their stable ID and scoped secrets.
 */
export async function saveConnection(input: StoredConnectionInput): Promise<StoredConnection> {
  const registry = await loadRemoteGatewayRegistry()
  const gatewayUrl = normalizeGatewayUrl(input.gatewayUrl)
  const profile = input.profile.trim() || 'default'
  const existing = input.id
    ? registry.connections.find(connection => connection.id === input.id)
    : registry.connections.find(connection => connection.baseUrl === gatewayUrl && connection.profile === profile)
  const id = existing?.id ?? (registry.connections.length === 0 && !input.id
    ? PRIMARY_CONNECTION_ID
    : input.id?.trim() || createConnectionId())

  const nextRegistry = existing
    ? updateRemoteGatewayConnection(registry, id, {
      authMode: input.authMode,
      baseUrl: gatewayUrl,
      name: existing.name,
      profile
    }, Date.now())
    : addRemoteGatewayConnection(registry, {
      authMode: input.authMode,
      baseUrl: gatewayUrl,
      profile
    }, { id, now: Date.now() })

  await saveRemoteGatewayRegistry(selectRemoteGatewayConnection(nextRegistry, id))

  if (input.sessionToken) await saveSessionToken(input.sessionToken, id)

  return { authMode: input.authMode, gatewayUrl, id, profile }
}

export async function loadConnection(): Promise<StoredConnection | null> {
  const active = getActiveRemoteGatewayConnection(await loadRemoteGatewayRegistry())
  if (!active) return null

  const sessionToken = await loadSessionToken(active.id)
  return {
    authMode: active.authMode,
    gatewayUrl: active.baseUrl,
    id: active.id,
    profile: active.profile,
    sessionToken: sessionToken ?? undefined
  }
}

/** Selects an existing remote Gateway without creating or mutating a route. */
export async function selectConnection(connectionId: string): Promise<StoredConnection> {
  const registry = await loadRemoteGatewayRegistry()
  const selected = selectRemoteGatewayConnection(registry, connectionId)
  const connection = getActiveRemoteGatewayConnection(selected)
  if (!connection) throw new Error(`Unknown Gateway connection: ${connectionId}`)

  await saveRemoteGatewayRegistry(selected)
  return {
    authMode: connection.authMode,
    gatewayUrl: connection.baseUrl,
    id: connection.id,
    profile: connection.profile
  }
}

export function isTokenExpiringSoon(expiresAt: number, bufferSeconds = 60): boolean {
  if (!expiresAt || !Number.isFinite(expiresAt)) return true
  return Date.now() / 1000 >= expiresAt - bufferSeconds
}

/** Clears only one connection's secret material; registry metadata remains. */
export async function clearAllAuth(connectionId = PRIMARY_CONNECTION_ID): Promise<void> {
  const id = normalizeConnectionId(connectionId)
  const credentialKey = scopedSecureKey(LEGACY_SECURE_KEYS.credentials, id)
  const tokenKey = scopedSecureKey(LEGACY_SECURE_KEYS.sessionToken, id)

  if (!isNativePlatform()) {
    window.sessionStorage.removeItem(tokenKey)
    if (id === PRIMARY_CONNECTION_ID) window.sessionStorage.removeItem(LEGACY_SECURE_KEYS.sessionToken)
  }

  const removals: Promise<unknown>[] = [SecureStorage.remove(credentialKey), SecureStorage.remove(tokenKey)]
  if (id === PRIMARY_CONNECTION_ID) {
    removals.push(SecureStorage.remove(LEGACY_SECURE_KEYS.credentials), SecureStorage.remove(LEGACY_SECURE_KEYS.sessionToken))
  }
  await Promise.all(removals)
}
