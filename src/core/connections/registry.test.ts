import { describe, expect, it } from 'vitest'

import {
  addRemoteGatewayConnection,
  createEmptyRemoteGatewayRegistry,
  getActiveRemoteGatewayConnection,
  normalizeGatewayUrl,
  parseRemoteGatewayRegistry,
  removeRemoteGatewayConnection,
  selectRemoteGatewayConnection,
  setPrimaryRemoteGatewayConnection,
  updateRemoteGatewayConnection
} from './registry'

const now = 1_700_000_000_000

describe('remote Gateway registry', () => {
  it('only accepts HTTP Gateway URLs and normalizes trailing slashes', () => {
    expect(normalizeGatewayUrl(' https://gateway.example.com/base/ ')).toBe('https://gateway.example.com/base')
    expect(() => normalizeGatewayUrl('rhermes://gateway')).toThrow('HTTP or HTTPS')
  })

  it('treats a loopback URL as an ordinary external connection', () => {
    const registry = addRemoteGatewayConnection(
      createEmptyRemoteGatewayRegistry(),
      { authMode: 'oauth', baseUrl: 'http://127.0.0.1:9119/', profile: 'default' },
      { id: 'loopback', now }
    )

    expect(registry.connections[0]).toMatchObject({
      baseUrl: 'http://127.0.0.1:9119',
      id: 'loopback',
      name: '127.0.0.1:9119'
    })
  })

  it('initializes primary and active selection from the first connection', () => {
    const registry = addRemoteGatewayConnection(
      createEmptyRemoteGatewayRegistry(),
      { authMode: 'token', baseUrl: 'https://one.example.com' },
      { id: 'one', now }
    )

    expect(registry.primaryId).toBe('one')
    expect(getActiveRemoteGatewayConnection(registry)?.id).toBe('one')
  })

  it('keeps primary and last-used selection independently scoped', () => {
    let registry = addRemoteGatewayConnection(
      createEmptyRemoteGatewayRegistry(),
      { authMode: 'token', baseUrl: 'https://one.example.com' },
      { id: 'one', now }
    )
    registry = addRemoteGatewayConnection(
      registry,
      { authMode: 'oauth', baseUrl: 'https://two.example.com', profile: 'work' },
      { id: 'two', now: now + 1 }
    )
    registry = setPrimaryRemoteGatewayConnection(registry, 'two')
    registry = selectRemoteGatewayConnection(registry, 'one')

    expect(registry.primaryId).toBe('two')
    expect(getActiveRemoteGatewayConnection(registry)?.id).toBe('one')
  })

  it('preserves a connection identity while editing its remote route', () => {
    const initial = addRemoteGatewayConnection(
      createEmptyRemoteGatewayRegistry(),
      { authMode: 'token', baseUrl: 'https://one.example.com', name: 'One' },
      { id: 'one', now }
    )
    const updated = updateRemoteGatewayConnection(
      initial,
      'one',
      { authMode: 'oauth', baseUrl: 'https://gateway.example.com/api', profile: 'work' },
      now + 1
    )

    expect(updated.connections[0]).toMatchObject({
      authMode: 'oauth',
      baseUrl: 'https://gateway.example.com/api',
      id: 'one',
      profile: 'work'
    })
    expect(updated.connections[0].createdAt).toBe(now)
  })

  it('moves selected references to a remaining remote connection after removal', () => {
    let registry = addRemoteGatewayConnection(
      createEmptyRemoteGatewayRegistry(),
      { authMode: 'token', baseUrl: 'https://one.example.com' },
      { id: 'one', now }
    )
    registry = addRemoteGatewayConnection(
      registry,
      { authMode: 'token', baseUrl: 'https://two.example.com' },
      { id: 'two', now }
    )
    registry = setPrimaryRemoteGatewayConnection(registry, 'two')
    registry = selectRemoteGatewayConnection(registry, 'two')

    const afterRemoval = removeRemoteGatewayConnection(registry, 'two')
    expect(afterRemoval.primaryId).toBe('one')
    expect(afterRemoval.lastUsedId).toBe('one')
  })

  it('rejects malformed persisted registries instead of routing with unsafe data', () => {
    expect(parseRemoteGatewayRegistry({ version: 1, connections: [{ id: 'one', baseUrl: 'file:///tmp' }] })).toBeNull()
    expect(parseRemoteGatewayRegistry({ version: 1, connections: [], primaryId: 'missing', lastUsedId: null })).toBeNull()
  })

  it('normalizes a valid persisted route before returning it', () => {
    expect(parseRemoteGatewayRegistry({
      version: 1,
      connections: [{
        id: 'one',
        name: 'Gateway',
        baseUrl: 'https://gateway.example.com/',
        authMode: 'oauth',
        profile: 'default',
        createdAt: now,
        updatedAt: now
      }],
      primaryId: 'one',
      lastUsedId: 'one'
    })?.connections[0].baseUrl).toBe('https://gateway.example.com')
  })
})
