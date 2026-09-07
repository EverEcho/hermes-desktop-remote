import type { GatewayEvent } from '@/shared'
import { atom } from 'nanostores'

import { recordSessionMapping, setSessionDot } from '@/sessions/session-states'
import type { SessionResumeResponse } from '@/types/hermes'

import { getGateway } from './ws-client'

export interface ApprovalRequest {
  requestId: string
  sessionId: string
  command?: string
  description?: string
  allowPermanent?: boolean
  choices?: string[]
  smartDenied?: boolean
}

export interface ClarifyRequest {
  requestId: string
  sessionId: string
  question: string
  choices?: string[]
  multiSelect?: boolean
  questions?: Array<{ qid: string; question: string; choices?: string[]; multiSelect?: boolean }>
  lockedAnswers?: Record<string, string>
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

export interface McpSetupRequest {
  requestId: string
  sessionId: string
  server: string
  action: 'authorize' | 'enable' | 'install'
  reason?: string
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
export const $pendingMcpSetup = atom<McpSetupRequest[]>([])
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

/** Re-arm input prompts returned by session.resume when the original event was
 * emitted while the mobile socket was detached. This is deliberately shared
 * with the live event path so resumed prompts get the same global sheets and
 * status dots, and duplicate replay/live frames remain harmless. */
export function restorePendingSessionInputs(sessionId: string, response: SessionResumeResponse): void {
  const approval = response.pending_approval
  if (approval?.request_id) {
    const existing = $pendingApprovals.get().some(item => item.requestId === approval.request_id)
    if (!existing) {
      $pendingApprovals.set([...$pendingApprovals.get(), {
        requestId: approval.request_id,
        sessionId,
        allowPermanent: approval.allow_permanent,
        choices: approval.choices,
        smartDenied: approval.smart_denied,
        command: approval.command,
        description: approval.description
      }])
    }
  }

  const clarify = response.pending_clarify
  if (clarify?.request_id) {
    const existing = $pendingClarifications.get().some(item => item.requestId === clarify.request_id)
    if (!existing) {
      const questions = Array.isArray(clarify.questions)
        ? clarify.questions.flatMap((item, index) => {
            if (!item || typeof item !== 'object') return []
            const row = item as Record<string, unknown>
            const question = typeof row.question === 'string' ? row.question.trim() : ''
            if (!question) return []
            return [{
              qid: typeof row.qid === 'string' && row.qid ? row.qid : `q${index}`,
              question,
              choices: Array.isArray(row.choices) ? row.choices.filter((value): value is string => typeof value === 'string') : undefined,
              multiSelect: row.multi_select === true
            }]
          })
        : undefined
      const answers = typeof clarify.answers === 'object' && clarify.answers !== null
        ? Object.fromEntries(Object.entries(clarify.answers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
        : undefined
      $pendingClarifications.set([...$pendingClarifications.get(), {
        requestId: clarify.request_id,
        sessionId,
        question: typeof clarify.question === 'string' ? clarify.question : '',
        choices: Array.isArray(clarify.choices) ? clarify.choices.filter((value): value is string => typeof value === 'string') : undefined,
        multiSelect: clarify.multi_select === true,
        ...(questions?.length ? { questions } : {}),
        ...(answers ? { lockedAnswers: answers } : {})
      }])
    }
  }

  if ($pendingApprovals.get().some(item => item.sessionId === sessionId) ||
      $pendingClarifications.get().some(item => item.sessionId === sessionId) ||
      $pendingSecrets.get().some(item => item.sessionId === sessionId) ||
      $pendingSudo.get().some(item => item.sessionId === sessionId)) {
    setSessionDot(sessionId, 'needs-input')
  }
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
    case 'mcp.setup.request':
      setSessionDot(sessionId, 'needs-input')
      break

    default:
      break
  }

  switch (event.type) {
    case 'approval.request': {
      const requestId = String(payload.request_id ?? '')
      if (!requestId || $pendingApprovals.get().some(item => item.requestId === requestId)) break
      const request: ApprovalRequest = {
        requestId,
        sessionId: event.session_id ?? '',
        command: payload.command as string | undefined,
        description: payload.description as string | undefined,
        allowPermanent: payload.allow_permanent as boolean | undefined,
        choices: payload.choices as string[] | undefined,
        smartDenied: payload.smart_denied as boolean | undefined
      }
      $pendingApprovals.set([...$pendingApprovals.get(), request])
      break
    }

    case 'clarify.request': {
      const requestId = String(payload.request_id ?? '')
      if (!requestId || $pendingClarifications.get().some(item => item.requestId === requestId)) break
      const questions = Array.isArray(payload.questions)
        ? payload.questions.flatMap((item, index) => {
            if (!item || typeof item !== 'object') return []
            const row = item as Record<string, unknown>
            const question = typeof row.question === 'string' ? row.question.trim() : ''
            return question ? [{ qid: typeof row.qid === 'string' && row.qid ? row.qid : `q${index}`, question, choices: Array.isArray(row.choices) ? row.choices.filter((value): value is string => typeof value === 'string') : undefined, multiSelect: row.multi_select === true }] : []
          })
        : undefined
      const request: ClarifyRequest = {
        requestId,
        sessionId: event.session_id ?? '',
        question: String(payload.question ?? ''),
        choices: payload.choices as string[] | undefined,
        multiSelect: payload.multi_select as boolean | undefined,
        ...(questions?.length ? { questions } : {}),
        ...(payload.answers && typeof payload.answers === 'object' ? { lockedAnswers: payload.answers as Record<string, string> } : {})
      }
      $pendingClarifications.set([...$pendingClarifications.get(), request])
      break
    }

    case 'clarify.expire': {
      const requestId = String(payload.request_id ?? '')
      const remaining = $pendingClarifications.get().filter(item =>
        item.requestId !== requestId || (event.session_id && item.sessionId !== event.session_id)
      )
      $pendingClarifications.set(remaining)
      if (event.session_id && !remaining.some(item => item.sessionId === event.session_id)) {
        setSessionDot(event.session_id, null)
      }
      break
    }

    case 'secret.request': {
      const request: SecretRequest = {
        requestId: String(payload.request_id ?? ''),
        sessionId: event.session_id ?? '',
        envVar: String(payload.env_var ?? ''),
        prompt: payload.prompt as string | undefined
      }
      if (!request.requestId || $pendingSecrets.get().some(item => item.requestId === request.requestId)) break
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
      if ($pendingSudo.get().some(item => item.requestId === request.requestId)) break
      $pendingSudo.set([...$pendingSudo.get(), request])
      break
    }

    case 'mcp.setup.request': {
      const requestId = String(payload.request_id ?? '')
      if (!requestId || $pendingMcpSetup.get().some(item => item.requestId === requestId)) break
      const rawAction = String(payload.action ?? 'install')
      const action: McpSetupRequest['action'] = rawAction === 'enable' || rawAction === 'authorize' ? rawAction : 'install'
      $pendingMcpSetup.set([...$pendingMcpSetup.get(), {
        requestId,
        sessionId: event.session_id ?? '',
        server: String(payload.server ?? ''),
        action,
        reason: typeof payload.reason === 'string' ? payload.reason : undefined
      }])
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
    choice: !approved ? 'deny' : permanent ? 'always' : 'once',
    session_id: request?.sessionId || undefined
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
    answer,
    session_id: request?.sessionId || undefined
  })

  $pendingClarifications.set($pendingClarifications.get().filter(c => c.requestId !== requestId))

  if (request && !$pendingClarifications.get().some(c => c.sessionId === request.sessionId)) {
    setSessionDot(request.sessionId, null)
  }
}

/** Batch clarify uses one ordered RPC per question; the final lock releases the
 * backend tool, so never parallelize these calls. */
export async function resolveClarificationBatch(
  requestId: string,
  answers: Array<{ questionId: string; answer: string }>
): Promise<void> {
  const gateway = getGateway()
  const request = $pendingClarifications.get().find(item => item.requestId === requestId)
  if (!gateway) throw new Error('Gateway not connected')
  if (!request) throw new Error('Clarification request is no longer pending')

  for (const item of answers) {
    await gateway.request('clarify.respond', {
      request_id: requestId,
      question_id: item.questionId,
      answer: item.answer,
      session_id: request.sessionId || undefined
    })
  }

  $pendingClarifications.set($pendingClarifications.get().filter(item => item.requestId !== requestId))
  if (!$pendingClarifications.get().some(item => item.sessionId === request.sessionId)) {
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

export function resolveMcpSetup(requestId: string, result: Record<string, unknown>): void {
  const gateway = getGateway()
  const request = $pendingMcpSetup.get().find(item => item.requestId === requestId)
  if (!gateway || !request) return
  $pendingMcpSetup.set($pendingMcpSetup.get().filter(item => item.requestId !== requestId))
  if (!request.sessionId || !$pendingMcpSetup.get().some(item => item.sessionId === request.sessionId)) {
    setSessionDot(request.sessionId, null)
  }
  void gateway.request('mcp.setup.respond', {
    request_id: requestId,
    session_id: request.sessionId || undefined,
    result: JSON.stringify(result)
  }).catch(() => undefined)
}
