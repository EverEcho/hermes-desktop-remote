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
    const event: GatewayEvent = {
      type: 'message.delta',
      session_id: activeRuntime,
      payload: { text: 'hello' }
    }

    expect(shouldAcceptEvent(event, activeRuntime)).toBe(true)
  })

  it('rejects events scoped to a different runtime session', () => {
    const event: GatewayEvent = {
      type: 'message.delta',
      session_id: 'runtime-other',
      payload: { text: 'wrong session' }
    }

    expect(shouldAcceptEvent(event, activeRuntime)).toBe(false)
  })

  it('rejects unscoped stream events when a runtime is active', () => {
    const event: GatewayEvent = {
      type: 'tool.start',
      payload: { name: 'bash' }
    }

    expect(shouldAcceptEvent(event, activeRuntime)).toBe(false)
  })

  it('accepts unscoped non-stream events (e.g. gateway.ready)', () => {
    const event: GatewayEvent = { type: 'gateway.ready' }

    expect(shouldAcceptEvent(event, activeRuntime)).toBe(true)
  })

  it('accepts all events when no runtime is active (new session)', () => {
    const event: GatewayEvent = {
      type: 'message.delta',
      payload: { text: 'first message' }
    }

    expect(shouldAcceptEvent(event, null)).toBe(true)
  })

  it('rejects background session tool events', () => {
    const event: GatewayEvent = {
      type: 'tool.complete',
      session_id: 'background-session-xyz',
      payload: { result: 'done' }
    }

    expect(shouldAcceptEvent(event, activeRuntime)).toBe(false)
  })

  it('accepts session.title for the active session', () => {
    const event: GatewayEvent = {
      type: 'session.title',
      session_id: activeRuntime,
      payload: { title: 'My Chat' }
    }

    expect(shouldAcceptEvent(event, activeRuntime)).toBe(true)
  })
})
