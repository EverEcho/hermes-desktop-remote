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

describe('Git review API contract', () => {
  beforeEach(() => {
    configureHttpClient({ gatewayUrl: 'https://gw.test', authMode: 'token', sessionToken: 'tok' })
    vi.stubGlobal('fetch', mockFetchOk({ ok: true }))
  })

  it('stage sends file + path to /api/git/review/stage', async () => {
    await api.gitStage('src/app.ts', '/srv/work')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = call[0] as string
    const body = JSON.parse(call[1].body as string)

    expect(url).toContain('/api/git/review/stage')
    expect(body).toEqual({ file: 'src/app.ts', path: '/srv/work' })
  })

  it('stage with null file stages all changes', async () => {
    await api.gitStage(null, '/repo')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body as string)

    expect(body.file).toBeNull()
    expect(body.path).toBe('/repo')
  })

  it('unstage sends file + path to /api/git/review/unstage', async () => {
    await api.gitUnstage('a.txt', '/repo')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = call[0] as string
    const body = JSON.parse(call[1].body as string)

    expect(url).toContain('/api/git/review/unstage')
    expect(body).toEqual({ file: 'a.txt', path: '/repo' })
  })

  it('commit sends message + path + push flag to /api/git/review/commit', async () => {
    await api.gitCommit('fix: thing', '/repo', false)

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = call[0] as string
    const body = JSON.parse(call[1].body as string)

    expect(url).toContain('/api/git/review/commit')
    expect(body).toEqual({ message: 'fix: thing', path: '/repo', push: false })
  })

  it('push sends path to /api/git/review/push', async () => {
    await api.gitPush('/repo')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = call[0] as string
    const body = JSON.parse(call[1].body as string)

    expect(url).toContain('/api/git/review/push')
    expect(body).toEqual({ path: '/repo' })
  })

  it('file-diff uses query params file + path (not cwd)', async () => {
    await api.gitFileDiff('src/a b.ts', '/repo')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = call[0] as string

    expect(url).toContain('/api/git/file-diff?')
    expect(url).toContain('file=')
    expect(url).toContain('path=')
    expect(url).not.toContain('cwd')
  })

  it('revert sends file + path to /api/git/review/revert', async () => {
    await api.gitRevert('b.txt', '/repo')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = call[0] as string
    const body = JSON.parse(call[1].body as string)

    expect(url).toContain('/api/git/review/revert')
    expect(body).toEqual({ file: 'b.txt', path: '/repo' })
  })
})
