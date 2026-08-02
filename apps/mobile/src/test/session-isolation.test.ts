import { describe, expect, it } from 'vitest'

import type { GatewayEvent } from '@hermes/shared'

const STREAM_EVENT_TYPES = new Set([
  'approval.request',
  'clarify.request',
  'error',
  'message.complete',
  'message.delta',
  'message.interim',
  'message.start',
  'reasoning.available',
  'reasoning.delta',
  'secret.request',
  'status.update',
  'sudo.request',
  'thinking.delta',
  'tool.complete',
  'tool.generating',
  'tool.progress',
  'tool.start'
])

function shouldAcceptEvent(
  event: GatewayEvent,
  activeRuntimeId: string | null
): boolean {
  if (event.session_id && activeRuntimeId && event.session_id !== activeRuntimeId) {
    return false
  }

  if (!event.session_id && activeRuntimeId && STREAM_EVENT_TYPES.has(event.type)) {
    return false
  }

  return true
}

describe('session event isolation', () => {
  const activeRuntime = 'runtime-abc'

  it('accepts events scoped to the active runtime session', () => {
    expect(shouldAcceptEvent(
      { type: 'message.delta', session_id: activeRuntime, payload: { text: 'hello' } },
      activeRuntime
    )).toBe(true)
  })

  it('rejects events scoped to a different runtime session', () => {
    expect(shouldAcceptEvent(
      { type: 'message.delta', session_id: 'runtime-other', payload: { text: 'wrong' } },
      activeRuntime
    )).toBe(false)
  })

  it('rejects unscoped stream events when a runtime is active', () => {
    expect(shouldAcceptEvent(
      { type: 'tool.start', payload: { name: 'bash' } },
      activeRuntime
    )).toBe(false)
  })

  it('accepts unscoped non-stream events', () => {
    expect(shouldAcceptEvent(
      { type: 'gateway.ready' },
      activeRuntime
    )).toBe(true)
  })

  it('accepts all events when no runtime is active', () => {
    expect(shouldAcceptEvent(
      { type: 'message.delta', payload: { text: 'first' } },
      null
    )).toBe(true)
  })

  it('rejects background session tool events', () => {
    expect(shouldAcceptEvent(
      { type: 'tool.complete', session_id: 'bg-xyz', payload: { result: 'done' } },
      activeRuntime
    )).toBe(false)
  })

  it('accepts session.title for the active session', () => {
    expect(shouldAcceptEvent(
      { type: 'session.title', session_id: activeRuntime, payload: { title: 'My Chat' } },
      activeRuntime
    )).toBe(true)
  })

  it('rejects message.start from a different session', () => {
    expect(shouldAcceptEvent(
      { type: 'message.start', session_id: 'other-session' },
      activeRuntime
    )).toBe(false)
  })

  it('rejects thinking.delta from a different session', () => {
    expect(shouldAcceptEvent(
      { type: 'thinking.delta', session_id: 'other-session', payload: { text: '...' } },
      activeRuntime
    )).toBe(false)
  })
})
