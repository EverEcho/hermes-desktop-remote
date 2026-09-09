import { describe, expect, it } from 'vitest'

import { SessionViewCache, type SessionViewSnapshot } from './session-view-cache'

function snapshot(title: string): SessionViewSnapshot {
  return {
    awaitingResponse: false,
    busy: false,
    cwd: '/workspace',
    fast: false,
    hasEarlier: false,
    messages: [],
    model: 'model',
    provider: 'provider',
    reasoningEffort: 'medium',
    runtimeId: `runtime-${title}`,
    title,
    transcriptOffset: 0
  }
}

describe('SessionViewCache', () => {
  it('keeps independent snapshots for each conversation', () => {
    const cache = new SessionViewCache()
    cache.set('a', snapshot('A'))
    cache.set('b', snapshot('B'))
    expect(cache.get('a')?.title).toBe('A')
    expect(cache.get('b')?.title).toBe('B')
  })

  it('evicts the least recently used snapshot', () => {
    const cache = new SessionViewCache(2)
    cache.set('a', snapshot('A'))
    cache.set('b', snapshot('B'))
    cache.get('a')
    cache.set('c', snapshot('C'))
    expect(cache.get('a')?.title).toBe('A')
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')?.title).toBe('C')
  })
})
