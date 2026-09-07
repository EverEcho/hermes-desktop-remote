import { describe, expect, it } from 'vitest'

import { buildAuthorizeUrl, parseOAuthCallback, parseTokenResponse, REDIRECT_URI } from '@/auth/pkce'

describe('OAuth PKCE protocol alignment', () => {
  it('builds authorize URL with S256 challenge and mobile redirect URI', () => {
    const url = buildAuthorizeUrl('https://gw.example.com', 'challenge123', 'state456')

    expect(url).toContain('https://gw.example.com/auth/native/authorize')
    expect(url).toContain('code_challenge=challenge123')
    expect(url).toContain('code_challenge_method=S256')
    expect(url).toContain(`redirect_uri=${encodeURIComponent(REDIRECT_URI)}`)
    expect(url).toContain('state=state456')
    expect(url).toContain('response_type=code')
  })

  it('strips trailing slashes from gateway URL', () => {
    const url = buildAuthorizeUrl('https://gw.example.com///', 'c', 's')

    expect(url.startsWith('https://gw.example.com/auth/native/authorize')).toBe(true)
  })

  it('parses a valid OAuth callback URL', () => {
    const result = parseOAuthCallback('rhermes-mobile://oauth/callback?code=abc123&state=xyz789')

    expect(result).toEqual({ code: 'abc123', state: 'xyz789' })
  })

  it('rejects callback with missing code', () => {
    expect(parseOAuthCallback('rhermes-mobile://oauth/callback?state=xyz')).toBeNull()
  })

  it('rejects callback with wrong scheme', () => {
    expect(parseOAuthCallback('https://evil.com/callback?code=abc&state=xyz')).toBeNull()
  })

  it('rejects non-URL input', () => {
    expect(parseOAuthCallback('not a url')).toBeNull()
  })

  it('parses token response with expires_at (epoch seconds) and provider', () => {
    const parsed = parseTokenResponse({
      access_token: 'at-123',
      refresh_token: 'rt-456',
      expires_at: 1893456000,
      provider: 'nous',
      user_id: 'u-1',
      token_type: 'Bearer'
    })

    expect(parsed.accessToken).toBe('at-123')
    expect(parsed.refreshToken).toBe('rt-456')
    expect(parsed.expiresAt).toBe(1893456000)
    expect(parsed.provider).toBe('nous')
    expect(parsed.userId).toBe('u-1')
  })

  it('defaults expiresAt to 0 when absent (triggers immediate refresh)', () => {
    const parsed = parseTokenResponse({ access_token: 'at' })

    expect(parsed.expiresAt).toBe(0)
    expect(parsed.refreshToken).toBe('')
    expect(parsed.provider).toBe('')
  })

  it('throws when access_token is missing', () => {
    expect(() => parseTokenResponse({ refresh_token: 'rt' })).toThrow('missing access_token')
  })

  it('treats non-finite expires_at as 0', () => {
    const parsed = parseTokenResponse({ access_token: 'at', expires_at: Infinity })

    expect(parsed.expiresAt).toBe(0)
  })
})
