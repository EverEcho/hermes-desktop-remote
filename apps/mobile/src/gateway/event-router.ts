import type { GatewayEvent } from '@hermes/shared'
import { atom } from 'nanostores'

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

  void gateway.request('approval.respond', {
    request_id: requestId,
    approved,
    permanent
  })

  $pendingApprovals.set($pendingApprovals.get().filter(a => a.requestId !== requestId))
}

export function resolveClarification(requestId: string, answer: string): void {
  const gateway = getGateway()

  if (!gateway) {
    return
  }

  void gateway.request('clarify.respond', {
    request_id: requestId,
    answer
  })

  $pendingClarifications.set($pendingClarifications.get().filter(c => c.requestId !== requestId))
}

export function resolveSecret(requestId: string, value: string): void {
  const gateway = getGateway()

  if (!gateway) {
    return
  }

  void gateway.request('secret.respond', {
    request_id: requestId,
    value
  })

  $pendingSecrets.set($pendingSecrets.get().filter(s => s.requestId !== requestId))
}
