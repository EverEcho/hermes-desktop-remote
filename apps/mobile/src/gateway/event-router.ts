import type { GatewayEvent } from '@hermes/shared'
import { atom } from 'nanostores'

import { recordSessionMapping, setSessionDot } from '@/sessions/session-states'

import { getGateway } from './ws-client'

export interface ApprovalRequest {
  requestId: string
  sessionId: string
  command?: string
  description?: string
  allowPermanent?: boolean
}

export interface ClarifyRequest {
  requestId: string
  sessionId: string
  question: string
  choices?: string[]
}

export interface SecretRequest {
  requestId: string
  sessionId: string
  envVar: string
  prompt?: string
}

export interface SudoRequest {
  requestId: string
  sessionId: string
}

export interface TerminalOutput {
  processId: string
  sessionId: string
  chunk: string
  title?: string
  exitCode?: number
}

export const $pendingApprovals = atom<ApprovalRequest[]>([])
export const $pendingClarifications = atom<ClarifyRequest[]>([])
export const $pendingSecrets = atom<SecretRequest[]>([])
export const $pendingSudo = atom<SudoRequest[]>([])
export const $terminalOutputs = atom<Map<string, TerminalOutput>>(new Map())

type EventCallback = (event: GatewayEvent) => void

const listeners = new Set<EventCallback>()
let unsubscribe: (() => void) | null = null

export function onGatewayEvent(callback: EventCallback): () => void {
  listeners.add(callback)

  return () => {
    listeners.delete(callback)
  }
}

export function startEventRouter(): void {
  const gateway = getGateway()

  if (!gateway || unsubscribe) {
    return
  }

  unsubscribe = gateway.onEvent(event => {
    routeEvent(event)

    for (const listener of listeners) {
      listener(event)
    }
  })
}

export function stopEventRouter(): void {
  unsubscribe?.()
  unsubscribe = null
}

function routeEvent(event: GatewayEvent): void {
  const payload = (event.payload ?? {}) as Record<string, unknown>
  const sessionId = event.session_id ?? ''

  /* Sidebar status dots (Desktop session-states parity, simplified). */
  switch (event.type) {
    case 'session.info': {
      const storedId = payload.stored_session_id

      if (sessionId && typeof storedId === 'string' && storedId) {
        recordSessionMapping(sessionId, storedId)
      }
      break
    }

    case 'message.start':
      setSessionDot(sessionId, 'working')
      break

    case 'message.complete':
    case 'error':
      setSessionDot(sessionId, null)
      break

    case 'session.reclaimed':
      // The live session is gone — drop any working/needs-input dot.
      setSessionDot(sessionId, null)
      break

    case 'approval.request':
    case 'clarify.request':
    case 'secret.request':
    case 'sudo.request':
      setSessionDot(sessionId, 'needs-input')
      break

    default:
      break
  }

  switch (event.type) {
    case 'approval.request': {
      const request: ApprovalRequest = {
        requestId: String(payload.request_id ?? ''),
        sessionId: event.session_id ?? '',
        command: payload.command as string | undefined,
        description: payload.description as string | undefined,
        allowPermanent: payload.allow_permanent as boolean | undefined
      }
      $pendingApprovals.set([...$pendingApprovals.get(), request])
      break
    }

    case 'clarify.request': {
      const request: ClarifyRequest = {
        requestId: String(payload.request_id ?? ''),
        sessionId: event.session_id ?? '',
        question: String(payload.question ?? ''),
        choices: payload.choices as string[] | undefined
      }
      $pendingClarifications.set([...$pendingClarifications.get(), request])
      break
    }

    case 'secret.request': {
      const request: SecretRequest = {
        requestId: String(payload.request_id ?? ''),
        sessionId: event.session_id ?? '',
        envVar: String(payload.env_var ?? ''),
        prompt: payload.prompt as string | undefined
      }
      $pendingSecrets.set([...$pendingSecrets.get(), request])
      break
    }

    case 'sudo.request': {
      const requestId = String(payload.request_id ?? '')
      if (!requestId) break
      const request: SudoRequest = {
        requestId,
        sessionId: event.session_id ?? ''
      }
      $pendingSudo.set([...$pendingSudo.get(), request])
      break
    }

    case 'agent.terminal.output': {
      const processId = String(payload.process_id ?? '')
      const outputs = $terminalOutputs.get()
      const existing = outputs.get(processId)

      outputs.set(processId, {
        processId,
        sessionId: event.session_id ?? '',
        chunk: (existing?.chunk ?? '') + String(payload.chunk ?? ''),
        title: (payload.title as string) ?? existing?.title,
        exitCode: payload.exit_code as number | undefined
      })

      $terminalOutputs.set(new Map(outputs))
      break
    }

    default:
      break
  }
}

export function resolveApproval(requestId: string, approved: boolean, permanent = false): void {
  const gateway = getGateway()

  if (!gateway) {
    return
  }

  const request = $pendingApprovals.get().find(a => a.requestId === requestId)

  void gateway.request('approval.respond', {
    request_id: requestId,
    approved,
    permanent
  })

  $pendingApprovals.set($pendingApprovals.get().filter(a => a.requestId !== requestId))

  if (request && !$pendingApprovals.get().some(a => a.sessionId === request.sessionId)) {
    setSessionDot(request.sessionId, null)
  }
}

export function resolveClarification(requestId: string, answer: string): void {
  const gateway = getGateway()

  if (!gateway) {
    return
  }

  const request = $pendingClarifications.get().find(c => c.requestId === requestId)

  void gateway.request('clarify.respond', {
    request_id: requestId,
    answer
  })

  $pendingClarifications.set($pendingClarifications.get().filter(c => c.requestId !== requestId))

  if (request && !$pendingClarifications.get().some(c => c.sessionId === request.sessionId)) {
    setSessionDot(request.sessionId, null)
  }
}

export function resolveSecret(requestId: string, value: string): void {
  const gateway = getGateway()

  if (!gateway) {
    return
  }

  const request = $pendingSecrets.get().find(s => s.requestId === requestId)

  void gateway.request('secret.respond', {
    request_id: requestId,
    value
  })

  $pendingSecrets.set($pendingSecrets.get().filter(s => s.requestId !== requestId))

  if (request && !$pendingSecrets.get().some(s => s.sessionId === request.sessionId)) {
    setSessionDot(request.sessionId, null)
  }
}

export function resolveSudo(requestId: string, password: string): void {
  const gateway = getGateway()

  if (!gateway) {
    return
  }

  const request = $pendingSudo.get().find(s => s.requestId === requestId)

  // The backend treats an empty password as a failed sudo (no command runs),
  // so dismissing the sheet is a safe refusal.
  void gateway.request('sudo.respond', {
    request_id: requestId,
    password
  })

  $pendingSudo.set($pendingSudo.get().filter(s => s.requestId !== requestId))

  if (request && !$pendingSudo.get().some(s => s.sessionId === request.sessionId)) {
    setSessionDot(request.sessionId, null)
  }
}
