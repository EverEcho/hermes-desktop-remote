export type GatewayAuthMode = 'cookie' | 'oauth' | 'token'

/**
 * Every connection is an externally reachable Gateway. `localhost` is merely
 * another URL here; it never implies a locally managed runtime.
 */
export interface RemoteGatewayConnection {
  authMode: GatewayAuthMode
  baseUrl: string
  createdAt: number
  id: string
  name: string
  profile: string
  updatedAt: number
}

export interface RemoteGatewayRegistry {
  connections: RemoteGatewayConnection[]
  lastUsedId: string | null
  primaryId: string | null
  version: 1
}

export interface RemoteGatewayConnectionInput {
  authMode: GatewayAuthMode
  baseUrl: string
  name?: string
  profile?: string
}

export function createEmptyRemoteGatewayRegistry(): RemoteGatewayRegistry {
  return { connections: [], lastUsedId: null, primaryId: null, version: 1 }
}

/** Safely accepts persisted JSON without allowing a malformed entry to leak into routing. */
export function parseRemoteGatewayRegistry(value: unknown): RemoteGatewayRegistry | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  if (raw.version !== 1 || !Array.isArray(raw.connections)) return null

  const seenIds = new Set<string>()
  const connections: RemoteGatewayConnection[] = []

  for (const entry of raw.connections) {
    if (!entry || typeof entry !== 'object') return null
    const connection = entry as Record<string, unknown>
    const id = typeof connection.id === 'string' ? connection.id.trim() : ''
    const authMode = connection.authMode
    const profile = typeof connection.profile === 'string' ? connection.profile.trim() : ''
    const name = typeof connection.name === 'string' ? connection.name.trim() : ''
    const createdAt = connection.createdAt
    const updatedAt = connection.updatedAt

    if (
      !id ||
      seenIds.has(id) ||
      (authMode !== 'cookie' && authMode !== 'oauth' && authMode !== 'token') ||
      !profile ||
      !name ||
      typeof createdAt !== 'number' ||
      !Number.isFinite(createdAt) ||
      typeof updatedAt !== 'number' ||
      !Number.isFinite(updatedAt) ||
      typeof connection.baseUrl !== 'string'
    ) {
      return null
    }

    let baseUrl: string
    try {
      baseUrl = normalizeGatewayUrl(connection.baseUrl)
    } catch {
      return null
    }

    seenIds.add(id)
    connections.push({
      authMode,
      baseUrl,
      createdAt,
      id,
      name,
      profile,
      updatedAt
    })
  }

  const primaryId = raw.primaryId === null ? null : typeof raw.primaryId === 'string' ? raw.primaryId : undefined
  const lastUsedId = raw.lastUsedId === null ? null : typeof raw.lastUsedId === 'string' ? raw.lastUsedId : undefined
  if (primaryId === undefined || lastUsedId === undefined) return null
  if ((primaryId && !seenIds.has(primaryId)) || (lastUsedId && !seenIds.has(lastUsedId))) return null

  return { connections, lastUsedId, primaryId, version: 1 }
}

export function normalizeGatewayUrl(value: string): string {
  let url: URL

  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Gateway URL must be a valid HTTP or HTTPS URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Gateway URL must use HTTP or HTTPS')
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Gateway URL cannot contain credentials, a query, or a fragment')
  }

  url.pathname = url.pathname.replace(/\/+$/, '') || '/'

  return url.toString().replace(/\/$/, '')
}

export function displayGatewayName(baseUrl: string): string {
  const url = new URL(baseUrl)
  return url.port ? `${url.hostname}:${url.port}` : url.hostname
}

export function addRemoteGatewayConnection(
  registry: RemoteGatewayRegistry,
  input: RemoteGatewayConnectionInput,
  options: { id: string; now: number }
): RemoteGatewayRegistry {
  if (registry.connections.some(connection => connection.id === options.id)) {
    throw new Error(`Gateway connection already exists: ${options.id}`)
  }

  const baseUrl = normalizeGatewayUrl(input.baseUrl)
  const connection: RemoteGatewayConnection = {
    authMode: input.authMode,
    baseUrl,
    createdAt: options.now,
    id: options.id,
    name: input.name?.trim() || displayGatewayName(baseUrl),
    profile: input.profile?.trim() || 'default',
    updatedAt: options.now
  }

  return {
    ...registry,
    connections: [...registry.connections, connection],
    lastUsedId: registry.lastUsedId ?? connection.id,
    primaryId: registry.primaryId ?? connection.id
  }
}

export function updateRemoteGatewayConnection(
  registry: RemoteGatewayRegistry,
  id: string,
  input: RemoteGatewayConnectionInput,
  now: number
): RemoteGatewayRegistry {
  const previous = registry.connections.find(connection => connection.id === id)

  if (!previous) {
    throw new Error(`Unknown Gateway connection: ${id}`)
  }

  const baseUrl = normalizeGatewayUrl(input.baseUrl)
  const next: RemoteGatewayConnection = {
    ...previous,
    authMode: input.authMode,
    baseUrl,
    name: input.name?.trim() || displayGatewayName(baseUrl),
    profile: input.profile?.trim() || 'default',
    updatedAt: now
  }

  return {
    ...registry,
    connections: registry.connections.map(connection => connection.id === id ? next : connection)
  }
}

export function removeRemoteGatewayConnection(
  registry: RemoteGatewayRegistry,
  id: string
): RemoteGatewayRegistry {
  const connections = registry.connections.filter(connection => connection.id !== id)
  const fallbackId = connections[0]?.id ?? null

  return {
    ...registry,
    connections,
    lastUsedId: registry.lastUsedId === id ? fallbackId : registry.lastUsedId,
    primaryId: registry.primaryId === id ? fallbackId : registry.primaryId
  }
}

export function selectRemoteGatewayConnection(
  registry: RemoteGatewayRegistry,
  id: string
): RemoteGatewayRegistry {
  if (!registry.connections.some(connection => connection.id === id)) {
    throw new Error(`Unknown Gateway connection: ${id}`)
  }

  return { ...registry, lastUsedId: id }
}

export function setPrimaryRemoteGatewayConnection(
  registry: RemoteGatewayRegistry,
  id: string
): RemoteGatewayRegistry {
  if (!registry.connections.some(connection => connection.id === id)) {
    throw new Error(`Unknown Gateway connection: ${id}`)
  }

  return { ...registry, primaryId: id }
}

export function getActiveRemoteGatewayConnection(
  registry: RemoteGatewayRegistry
): RemoteGatewayConnection | null {
  const selectedId = registry.lastUsedId ?? registry.primaryId
  return registry.connections.find(connection => connection.id === selectedId) ?? registry.connections[0] ?? null
}
