import { Preferences } from '@capacitor/preferences'

const KEYS = {
  encryptedBlob: 'rhermes.secure.blob',
  deviceKey: 'rhermes.secure.device_key',
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
  authMode: 'oauth' | 'token'
  profile: string
  sessionToken?: string
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const stored = await Preferences.get({ key: KEYS.deviceKey })

  if (stored?.value) {
    const rawKey = base64ToBytes(stored.value)

    return crypto.subtle.importKey('raw', rawKey.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt'
    ])
  }

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt'
  ])

  const rawKey = await crypto.subtle.exportKey('raw', key)
  await Preferences.set({ key: KEYS.deviceKey, value: bytesToBase64(new Uint8Array(rawKey)) })

  return key
}

async function encryptJSON(data: unknown): Promise<string> {
  const key = await getOrCreateDeviceKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  const plaintext = encoder.encode(JSON.stringify(data))

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)

  const blob = new Uint8Array(iv.length + ciphertext.byteLength)
  blob.set(iv, 0)
  blob.set(new Uint8Array(ciphertext), iv.length)

  return bytesToBase64(blob)
}

async function decryptJSON<T>(encoded: string): Promise<T> {
  const key = await getOrCreateDeviceKey()
  const blob = base64ToBytes(encoded)
  const iv = blob.slice(0, 12)
  const ciphertext = blob.slice(12)

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  const decoder = new TextDecoder()

  return JSON.parse(decoder.decode(plaintext)) as T
}

export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  const encrypted = await encryptJSON(creds)
  await Preferences.set({ key: KEYS.encryptedBlob, value: encrypted })
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const stored = await Preferences.get({ key: KEYS.encryptedBlob })

  if (!stored?.value) {
    return null
  }

  try {
    return await decryptJSON<StoredCredentials>(stored.value)
  } catch {
    await Preferences.remove({ key: KEYS.encryptedBlob })

    return null
  }
}

export async function saveSessionToken(token: string): Promise<void> {
  const encrypted = await encryptJSON({ sessionToken: token })
  await Preferences.set({ key: KEYS.encryptedBlob, value: encrypted })
}

export async function loadSessionToken(): Promise<string | null> {
  const stored = await Preferences.get({ key: KEYS.encryptedBlob })

  if (!stored?.value) {
    return null
  }

  try {
    const data = await decryptJSON<{ sessionToken?: string }>(stored.value)

    return data.sessionToken ?? null
  } catch {
    return null
  }
}

export async function saveConnection(conn: StoredConnection): Promise<void> {
  await Promise.all([
    Preferences.set({ key: KEYS.gatewayUrl, value: conn.gatewayUrl }),
    Preferences.set({ key: KEYS.authMode, value: conn.authMode }),
    Preferences.set({ key: KEYS.profile, value: conn.profile })
  ])

  if (conn.sessionToken) {
    await saveSessionToken(conn.sessionToken)
  }
}

export async function loadConnection(): Promise<StoredConnection | null> {
  const [gatewayUrl, authMode, profile] = await Promise.all([
    Preferences.get({ key: KEYS.gatewayUrl }),
    Preferences.get({ key: KEYS.authMode }),
    Preferences.get({ key: KEYS.profile })
  ])

  if (!gatewayUrl?.value) {
    return null
  }

  const sessionToken = await loadSessionToken()

  return {
    gatewayUrl: gatewayUrl.value,
    authMode: (authMode?.value as 'oauth' | 'token') ?? 'token',
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
  await Promise.all([
    Preferences.remove({ key: KEYS.encryptedBlob }),
    Preferences.remove({ key: KEYS.gatewayUrl }),
    Preferences.remove({ key: KEYS.authMode }),
    Preferences.remove({ key: KEYS.profile })
  ])
}
