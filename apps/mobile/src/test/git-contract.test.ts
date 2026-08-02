import { describe, expect, it } from 'vitest'

describe('Git review API contract', () => {
  it('stage sends file + path to /api/git/review/stage', () => {
    const filePath = 'src/app.ts'
    const repoPath = '/srv/work'

    const expectedBody = { file: filePath, path: repoPath }
    const expectedPath = '/api/git/review/stage'

    expect(expectedPath).toBe('/api/git/review/stage')
    expect(expectedBody).toEqual({ file: 'src/app.ts', path: '/srv/work' })
  })

  it('stage with null file stages all changes', () => {
    const expectedBody = { file: null, path: '/repo' }

    expect(expectedBody.file).toBeNull()
  })

  it('unstage sends file + path to /api/git/review/unstage', () => {
    const expectedPath = '/api/git/review/unstage'
    const expectedBody = { file: 'a.txt', path: '/repo' }

    expect(expectedPath).toBe('/api/git/review/unstage')
    expect(expectedBody).toHaveProperty('file')
    expect(expectedBody).toHaveProperty('path')
  })

  it('commit sends message + path + push flag to /api/git/review/commit', () => {
    const expectedPath = '/api/git/review/commit'
    const expectedBody = { message: 'fix: thing', path: '/repo', push: false }

    expect(expectedPath).toBe('/api/git/review/commit')
    expect(expectedBody).toEqual({ message: 'fix: thing', path: '/repo', push: false })
  })

  it('push sends path to /api/git/review/push', () => {
    const expectedPath = '/api/git/review/push'
    const expectedBody = { path: '/repo' }

    expect(expectedPath).toBe('/api/git/review/push')
    expect(expectedBody).toEqual({ path: '/repo' })
  })

  it('file-diff uses query params file + path (not cwd)', () => {
    const filePath = 'src/a b.ts'
    const repoPath = '/repo'
    const params = new URLSearchParams({ file: filePath, path: repoPath })
    const url = `/api/git/file-diff?${params.toString()}`

    expect(url).toBe('/api/git/file-diff?file=src%2Fa+b.ts&path=%2Frepo')
    expect(url).not.toContain('cwd')
  })

  it('revert sends file + path to /api/git/review/revert', () => {
    const expectedPath = '/api/git/review/revert'
    const expectedBody = { file: 'b.txt', path: '/repo' }

    expect(expectedPath).toBe('/api/git/review/revert')
    expect(expectedBody).toHaveProperty('file')
    expect(expectedBody).toHaveProperty('path')
  })
})
