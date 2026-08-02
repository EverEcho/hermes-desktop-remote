import { describe, expect, it } from 'vitest'

import { isTokenExpiringSoon } from '@/auth/token-store'

describe('token expiry logic', () => {
  it('returns true when token is past expiry minus 60s buffer', () => {
    const nowSeconds = Date.now() / 1000
    expect(isTokenExpiringSoon(nowSeconds + 30)).toBe(true)
    expect(isTokenExpiringSoon(nowSeconds - 10)).toBe(true)
  })

  it('returns false when token has more than 60s remaining', () => {
    const nowSeconds = Date.now() / 1000
    expect(isTokenExpiringSoon(nowSeconds + 120)).toBe(false)
  })

  it('returns true for zero/unknown expiry (forces refresh)', () => {
    expect(isTokenExpiringSoon(0)).toBe(true)
  })

  it('returns true for non-finite expiry', () => {
    expect(isTokenExpiringSoon(Infinity)).toBe(true)
    expect(isTokenExpiringSoon(NaN)).toBe(true)
  })
})
