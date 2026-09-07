const REDIRECT_URI = 'rhermes-mobile://oauth/callback'

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface PkceChallenge {
  verifier: string
  challenge: string
  state: string
}

export async function generatePkceChallenge(): Promise<PkceChallenge> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64UrlEncode(verifierBytes.buffer)

  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier))
  const challenge = base64UrlEncode(digest)

  const stateBytes = crypto.getRandomValues(new Uint8Array(16))
  const state = base64UrlEncode(stateBytes.buffer)

  return { verifier, challenge, state }
}

export function buildAuthorizeUrl(
  gatewayUrl: string,
  challenge: string,
  state: string
): string {
  const base = gatewayUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
  })

  return `${base}/auth/native/authorize?${params.toString()}`
}

export interface OAuthCallbackResult {
  code: string
  state: string
}

export function parseOAuthCallback(url: string): OAuthCallbackResult | null {
  try {
    const parsed = new URL(url)

    if (!parsed.protocol.startsWith('rhermes-mobile')) {
      return null
    }

    const code = parsed.searchParams.get('code')
    const state = parsed.searchParams.get('state')

    if (!code || !state) {
      return null
    }

    return { code, state }
  } catch {
    return null
  }
}

export interface NativeTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  provider: string
  user_id?: string
}

export interface ParsedTokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: number
  provider: string
  userId: string
}

export function parseTokenResponse(body: Record<string, unknown>): ParsedTokenSet {
  const accessToken = body.access_token

  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Gateway token response missing access_token')
  }

  const rawExpiresAt = body.expires_at
  const expiresAt =
    typeof rawExpiresAt === 'number' && Number.isFinite(rawExpiresAt) ? rawExpiresAt : 0

  return {
    accessToken,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : '',
    expiresAt,
    provider: typeof body.provider === 'string' ? body.provider : '',
    userId: typeof body.user_id === 'string' ? body.user_id : ''
  }
}

export async function exchangeCodeForTokens(
  gatewayUrl: string,
  code: string,
  verifier: string
): Promise<ParsedTokenSet> {
  const base = gatewayUrl.replace(/\/+$/, '')
  const response = await fetch(`${base}/auth/native/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier })
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Token exchange failed (${response.status}): ${text.slice(0, 200)}`)
  }

  const body = (await response.json()) as Record<string, unknown>

  return parseTokenResponse(body)
}

export async function refreshAccessToken(
  gatewayUrl: string,
  refreshToken: string,
  provider: string
): Promise<ParsedTokenSet> {
  const base = gatewayUrl.replace(/\/+$/, '')
  const response = await fetch(`${base}/auth/native/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, provider })
  })

  if (response.status === 401 || response.status === 403) {
    throw new TokenRefreshAuthError('Refresh token rejected — re-login required')
  }

  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status})`)
  }

  const body = (await response.json()) as Record<string, unknown>

  return parseTokenResponse(body)
}

export class TokenRefreshAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenRefreshAuthError'
  }
}

export async function requestWsTicket(
  gatewayUrl: string,
  accessToken: string
): Promise<string> {
  const base = gatewayUrl.replace(/\/+$/, '')
  const response = await fetch(`${base}/api/auth/ws-ticket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    throw new Error(`WS ticket request failed (${response.status})`)
  }

  const data = (await response.json()) as { ticket?: string }

  if (typeof data.ticket !== 'string' || !data.ticket) {
    throw new Error('Gateway did not return a WS ticket')
  }

  return data.ticket
}

export { REDIRECT_URI }
