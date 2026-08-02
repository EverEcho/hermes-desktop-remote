import type { GatewayEvent } from '@hermes/shared'
import { atom } from 'nanostores'

import type { SessionInfo, SessionMessage } from '@/types/hermes'
import type { MobileMessage, MobileToolCall } from '@/types/mobile'
import * as api from '@/gateway/api'
import { getGateway, onGatewayEvent } from '@/gateway'

export const $sessions = atom<SessionInfo[]>([])
export const $sessionsLoading = atom(true)
export const $activeSessionId = atom<string | null>(null)
export const $activeRuntimeId = atom<string | null>(null)
export const $messages = atom<MobileMessage[]>([])
export const $busy = atom(false)
export const $awaitingResponse = atom(false)
export const $currentModel = atom('')
export const $currentProvider = atom('')
export const $currentCwd = atom('')
export const $sessionTitle = atom<string | null>(null)

let eventCleanup: (() => void) | null = null
let activeSessionGeneration = 0

export async function refreshSessions(): Promise<void> {
  $sessionsLoading.set(true)

  try {
    const result = await api.listSessions(50)
    $sessions.set(result.sessions)
  } catch {
    // keep existing
  } finally {
    $sessionsLoading.set(false)
  }
}

export async function openSession(storedSessionId: string): Promise<void> {
  const generation = ++activeSessionGeneration
  $activeSessionId.set(storedSessionId)
  $messages.set([])
  $busy.set(false)
  $awaitingResponse.set(false)

  eventCleanup?.()
  eventCleanup = onGatewayEvent(event => handleSessionEvent(event, generation))

  try {
    const resumeResult = await api.resumeSession(storedSessionId)

    if (generation !== activeSessionGeneration) {
      return
    }

    $activeRuntimeId.set(resumeResult.session_id)
    $sessionTitle.set(null)

    if (resumeResult.info) {
      $currentModel.set(resumeResult.info.model ?? '')
      $currentProvider.set(resumeResult.info.provider ?? '')
      $currentCwd.set(resumeResult.info.cwd ?? '')
      $busy.set(resumeResult.info.running ?? false)
    }

    if (resumeResult.messages?.length) {
      $messages.set(convertMessages(resumeResult.messages))
    } else {
      const transcript = await api.getSessionMessages(storedSessionId)

      if (generation !== activeSessionGeneration) {
        return
      }

      $messages.set(convertMessages(transcript.messages))
    }
  } catch (error) {
    if (generation !== activeSessionGeneration) {
      return
    }

    try {
      const transcript = await api.getSessionMessages(storedSessionId)

      if (generation === activeSessionGeneration) {
        $messages.set(convertMessages(transcript.messages))
      }
    } catch {
      // session may not exist yet
    }
  }
}

export function closeSession(): void {
  activeSessionGeneration++
  eventCleanup?.()
  eventCleanup = null
  $activeSessionId.set(null)
  $activeRuntimeId.set(null)
  $messages.set([])
  $busy.set(false)
  $awaitingResponse.set(false)
  $sessionTitle.set(null)
}

export async function sendMessage(
  text: string,
  options?: { model?: string; provider?: string; reasoningEffort?: string }
): Promise<void> {
  const runtimeId = $activeRuntimeId.get()

  if (!runtimeId || !text.trim()) {
    return
  }

  const userMessage: MobileMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: text.trim(),
    timestamp: Date.now() / 1000
  }

  $messages.set([...$messages.get(), userMessage])
  $busy.set(true)
  $awaitingResponse.set(true)

  try {
    await api.submitPrompt(runtimeId, text.trim(), options)
  } catch (error) {
    $busy.set(false)
    $awaitingResponse.set(false)

    const errorMessage: MobileMessage = {
      id: `error-${Date.now()}`,
      role: 'assistant',
      content: '',
      error: error instanceof Error ? error.message : 'Failed to send message',
      timestamp: Date.now() / 1000
    }

    $messages.set([...$messages.get(), errorMessage])
  }
}

export async function stopGeneration(): Promise<void> {
  const runtimeId = $activeRuntimeId.get()

  if (!runtimeId) {
    return
  }

  try {
    await api.interruptSession(runtimeId)
  } catch {
    // best effort
  }
}

export async function createNewSession(cwd?: string): Promise<string | null> {
  try {
    const result = await api.createSession(cwd)
    const storedId = result.stored_session_id ?? result.session_id
    $activeRuntimeId.set(result.session_id)
    $activeSessionId.set(storedId)
    $messages.set([])
    $busy.set(false)
    $sessionTitle.set(null)

    const generation = ++activeSessionGeneration
    eventCleanup?.()
    eventCleanup = onGatewayEvent(event => handleSessionEvent(event, generation))

    void refreshSessions()

    return storedId
  } catch {
    return null
  }
}

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

function handleSessionEvent(event: GatewayEvent, generation: number): void {
  if (generation !== activeSessionGeneration) {
    return
  }

  const runtimeId = $activeRuntimeId.get()

  if (event.session_id && runtimeId && event.session_id !== runtimeId) {
    return
  }

  if (!event.session_id && runtimeId && STREAM_EVENT_TYPES.has(event.type)) {
    return
  }

  const payload = (event.payload ?? {}) as Record<string, unknown>
  const messages = $messages.get()

  switch (event.type) {
    case 'message.start': {
      $awaitingResponse.set(false)
      $busy.set(true)

      const assistantMsg: MobileMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now() / 1000,
        pending: true
      }

      $messages.set([...messages, assistantMsg])
      break
    }

    case 'message.delta': {
      const text = String(payload.text ?? '')

      if (!text) {
        break
      }

      const updated = [...messages]
      const last = updated[updated.length - 1]

      if (last && last.role === 'assistant' && last.pending) {
        updated[updated.length - 1] = { ...last, content: last.content + text }
        $messages.set(updated)
      }
      break
    }

    case 'message.complete': {
      $busy.set(false)
      $awaitingResponse.set(false)

      const updated = messages.map(msg =>
        msg.pending ? { ...msg, pending: false } : msg
      )
      $messages.set(updated)
      void refreshSessions()
      break
    }

    case 'thinking.delta':
    case 'reasoning.delta': {
      const text = String(payload.text ?? '')

      if (!text) {
        break
      }

      const updated = [...messages]
      const last = updated[updated.length - 1]

      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = {
          ...last,
          reasoning: (last.reasoning ?? '') + text
        }
        $messages.set(updated)
      }
      break
    }

    case 'tool.start': {
      const toolCall: MobileToolCall = {
        id: String(payload.tool_call_id ?? payload.id ?? Date.now()),
        name: String(payload.name ?? 'tool'),
        status: 'running',
        args: payload.args ?? payload.arguments
      }

      const updated = [...messages]
      const last = updated[updated.length - 1]

      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = {
          ...last,
          toolCalls: [...(last.toolCalls ?? []), toolCall]
        }
        $messages.set(updated)
      }
      break
    }

    case 'tool.complete': {
      const toolId = String(payload.tool_call_id ?? payload.id ?? '')
      const updated = messages.map(msg => {
        if (!msg.toolCalls?.length) {
          return msg
        }

        const toolCalls = msg.toolCalls.map(tc =>
          tc.id === toolId
            ? {
                ...tc,
                status: 'complete' as const,
                result: payload.result,
                summary: payload.summary as string | undefined,
                durationS: payload.duration_s as number | undefined,
                inlineDiff: payload.inline_diff as string | undefined
              }
            : tc
        )

        return { ...msg, toolCalls }
      })
      $messages.set(updated)
      break
    }

    case 'status.update': {
      if (payload.model) {
        $currentModel.set(String(payload.model))
      }

      if (payload.provider) {
        $currentProvider.set(String(payload.provider))
      }

      if (payload.cwd) {
        $currentCwd.set(String(payload.cwd))
      }

      if (typeof payload.running === 'boolean') {
        $busy.set(payload.running)
      }
      break
    }

    case 'session.info': {
      const storedId = payload.stored_session_id as string | undefined

      if (storedId && storedId !== $activeSessionId.get()) {
        $activeSessionId.set(storedId)
      }
      break
    }

    case 'session.title': {
      const title = payload.title as string | undefined

      if (title) {
        $sessionTitle.set(title)
      }
      break
    }

    case 'error': {
      $busy.set(false)
      $awaitingResponse.set(false)

      const errorText = String(payload.message ?? payload.error ?? 'Unknown error')
      const updated = [...messages]
      const last = updated[updated.length - 1]

      if (last && last.role === 'assistant' && last.pending) {
        updated[updated.length - 1] = { ...last, pending: false, error: errorText }
      } else {
        updated.push({
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: '',
          error: errorText,
          timestamp: Date.now() / 1000
        })
      }

      $messages.set(updated)
      break
    }

    default:
      break
  }
}

function convertMessages(raw: SessionMessage[]): MobileMessage[] {
  const result: MobileMessage[] = []

  for (const msg of raw) {
    if (msg.display_kind === 'hidden') {
      continue
    }

    const content = extractTextContent(msg.content)

    if (!content && msg.role !== 'tool') {
      continue
    }

    result.push({
      id: `msg-${msg.row_id ?? msg.id ?? result.length}`,
      role: msg.role,
      content,
      reasoning: msg.reasoning ?? msg.reasoning_content ?? undefined,
      timestamp: msg.timestamp,
      rowId: msg.row_id ?? msg.id
    })
  }

  return result
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter((part): part is { text: string; type: 'text' } => {
        return typeof part === 'object' && part !== null && (part as { type?: string }).type === 'text'
      })
      .map(part => part.text)
      .join('\n')
  }

  if (typeof content === 'object' && content !== null) {
    const obj = content as { text?: string }

    if (typeof obj.text === 'string') {
      return obj.text
    }
  }

  return ''
}
