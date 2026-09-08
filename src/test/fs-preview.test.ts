import { describe, expect, it, vi, beforeEach } from 'vitest'

import { configureHttpClient } from '@/gateway/http-client'
import * as api from '@/gateway/api'

function mockFetchOk(json: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(JSON.stringify(json))
  })
}

describe('FS Data URL preview contract', () => {
  beforeEach(() => {
    configureHttpClient({ gatewayUrl: 'https://gw.test', authMode: 'token', sessionToken: 'tok' })
  })

  it('fsReadDataUrl extracts data URL string directly', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }))
    const result = await api.fsReadDataUrl('images/logo.png')
    expect(result).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('fsReadDataUrl supports string response directly', async () => {
    vi.stubGlobal('fetch', mockFetchOk('data:application/pdf;base64,JVBERi0xLjc='))
    const result = await api.fsReadDataUrl('docs/spec.pdf')
    expect(result).toBe('data:application/pdf;base64,JVBERi0xLjc=')
  })

  it('fsReadDataUrl rejects non-data URL responses', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ dataUrl: 'file:///etc/passwd' }))
    await expect(api.fsReadDataUrl('bad.txt')).rejects.toThrow('Gateway did not return a file preview')
  })
})
