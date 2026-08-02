import { getAccessToken, $authState } from '@/auth'

export class ApiError extends Error {
  readonly status: number
  readonly isAuth: boolean

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.isAuth = status === 401 || status === 403
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  profile?: string
  timeoutMs?: number
  headers?: Record<string, string>
}

let _gatewayUrl = ''
let _authMode: 'oauth' | 'token' = 'token'
let _sessionToken: string | null = null
let _profile = 'default'

export function configureHttpClient(config: {
  gatewayUrl: string
  authMode: 'oauth' | 'token'
  sessionToken?: string | null
  profile?: string
}): void {
  _gatewayUrl = config.gatewayUrl.replace(/\/+$/, '')
  _authMode = config.authMode
  _sessionToken = config.sessionToken ?? null
  _profile = config.profile ?? 'default'
}

export function getGatewayBaseUrl(): string {
  return _gatewayUrl
}

export function getActiveProfile(): string {
  return _profile
}

export function setActiveProfile(profile: string): void {
  _profile = profile || 'default'
}

async function buildHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra
  }

  if (_authMode === 'token' && _sessionToken) {
    headers['X-Hermes-Session-Token'] = _sessionToken
  } else if (_authMode === 'oauth') {
    const token = await getAccessToken()

    if (!token) {
      throw new ApiError('Authentication required', 401)
    }

    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

function profileParam(profile?: string): string {
  const p = profile ?? _profile

  return p && p !== 'default' ? `profile=${encodeURIComponent(p)}` : ''
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, profile, timeoutMs = 30_000, headers: extraHeaders } = options

  const headers = await buildHeaders(extraHeaders)
  const separator = path.includes('?') ? '&' : '?'
  const pParam = profileParam(profile)
  const url = `${_gatewayUrl}${path}${pParam ? `${separator}${pParam}` : ''}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new ApiError(`API error ${response.status}: ${text.slice(0, 200)}`, response.status)
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export async function apiUpload<T>(
  path: string,
  data: ArrayBuffer,
  filename: string,
  contentType = 'application/octet-stream',
  profile?: string
): Promise<T> {
  const headers: Record<string, string> = {}

  if (_authMode === 'token' && _sessionToken) {
    headers['X-Hermes-Session-Token'] = _sessionToken
  } else if (_authMode === 'oauth') {
    const token = await getAccessToken()

    if (!token) {
      throw new ApiError('Authentication required', 401)
    }

    headers['Authorization'] = `Bearer ${token}`
  }

  const separator = path.includes('?') ? '&' : '?'
  const pParam = profileParam(profile)
  const url = `${_gatewayUrl}${path}${pParam ? `${separator}${pParam}` : ''}`

  const formData = new FormData()
  formData.append('file', new Blob([data], { type: contentType }), filename)

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new ApiError(`Upload failed ${response.status}: ${text.slice(0, 200)}`, response.status)
  }

  return (await response.json()) as T
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.isAuth
}
