import type { GatewayEvent } from '@hermes/shared'
import { atom } from 'nanostores'

import type { SessionInfo, SessionMessage } from '@/types/hermes'
import type { MobileMessage, MobileMessagePart } from '@/types/mobile'
import * as api from '@/gateway/api'
import { onGatewayEvent } from '@/gateway'

export const $sessions = atom<SessionInfo[]>([])
export const $sessionsLoading = atom(true)
export const $activeSessionId = atom<string | null>(null)
export const $activeRuntimeId = atom<string | null>(null)
export const $messages = atom<MobileMessage[]>([])
export const $busy = atom(false)
export const $awaitingResponse = atom(false)
export const $currentModel = atom('')
export const $currentProvider = atom('')
export const $currentReasoningEffort = atom('medium')
export const $currentFast = atom(false)
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
  } catch (_error) {
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

export interface SendMessageOptions {
  model?: string
  provider?: string
  reasoningEffort?: string
  attachments?: Array<{ data_url: string; filename: string }>
}

export async function sendMessage(
  text: string,
  options?: SendMessageOptions
): Promise<void> {
  const runtimeId = $activeRuntimeId.get()
  const storedSessionId = $activeSessionId.get()
  const generation = activeSessionGeneration

  if (!runtimeId || !storedSessionId || !text.trim()) {
    return
  }

  const userMessage: MobileMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    parts: [{ type: 'text', text: text.trim() }],
    timestamp: Date.now() / 1000
  }

  $messages.set([...$messages.get(), userMessage])
  $busy.set(true)
  $awaitingResponse.set(true)

  try {
    await submitPromptWithRecovery(runtimeId, storedSessionId, text.trim(), options)
  } catch (error) {
    if (generation !== activeSessionGeneration || storedSessionId !== $activeSessionId.get()) {
      return
    }

    $busy.set(false)
    $awaitingResponse.set(false)

    $messages.set($messages.get().map(message =>
      message.id === userMessage.id ? { ...message, failed: true } : message
    ))

    const errorMessage: MobileMessage = {
      id: `error-${Date.now()}`,
      role: 'assistant',
      parts: [],
      error: error instanceof Error ? error.message : 'Failed to send message',
      retryText: text.trim(),
      retryUserMessageId: userMessage.id,
      timestamp: Date.now() / 1000
    }

    $messages.set([...$messages.get(), errorMessage])
  }
}

export async function retryMessage(errorMessageId: string, text: string, userMessageId?: string): Promise<void> {
  $messages.set($messages.get().filter(message =>
    message.id !== errorMessageId && message.id !== userMessageId
  ))
  await sendMessage(text)
}

async function submitPromptWithRecovery(
  runtimeId: string,
  storedSessionId: string,
  text: string,
  options?: SendMessageOptions
): Promise<void> {
  try {
    await api.submitPrompt(runtimeId, text, options)
    return
  } catch (error) {
    if (!isRecoverableSubmitError(error) || storedSessionId !== $activeSessionId.get()) {
      throw error
    }
  }

  const resumed = await api.resumeSession(storedSessionId)
  const recoveredRuntimeId = resumed.session_id

  if (!recoveredRuntimeId || storedSessionId !== $activeSessionId.get()) {
    throw new Error('The conversation is no longer active. Please try again.')
  }

  $activeRuntimeId.set(recoveredRuntimeId)
  await api.submitPrompt(recoveredRuntimeId, text, options)
}

function isRecoverableSubmitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return /session not found|request timed out/i.test(message)
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
    const result = await api.createSession({
      cwd,
      model: $currentModel.get() || undefined,
      provider: $currentProvider.get() || undefined,
      reasoningEffort: $currentReasoningEffort.get(),
      fast: $currentFast.get()
    })
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
        parts: [],
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
        const parts = [...last.parts]
        const lastPart = parts[parts.length - 1]
        if (lastPart && lastPart.type === 'text') {
          parts[parts.length - 1] = { ...lastPart, text: lastPart.text + text }
        } else {
          parts.push({ type: 'text', text })
        }
        updated[updated.length - 1] = { ...last, parts }
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
        const parts = [...last.parts]
        const lastPart = parts[parts.length - 1]
        if (lastPart && lastPart.type === 'reasoning') {
          parts[parts.length - 1] = { ...lastPart, reasoning: lastPart.reasoning + text }
        } else {
          parts.push({ type: 'reasoning', reasoning: text })
        }
        updated[updated.length - 1] = { ...last, parts }
        $messages.set(updated)
      }
      break
    }

    case 'tool.start': {
      const toolCallPart: MobileMessagePart = {
        type: 'tool-call',
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
          parts: [...last.parts, toolCallPart]
        }
        $messages.set(updated)
      }
      break
    }

    case 'tool.complete': {
      const toolId = String(payload.tool_call_id ?? payload.id ?? '')
      const updated = messages.map(msg => {
        if (!msg.parts?.length) {
          return msg
        }

        const parts = msg.parts.map(p =>
          p.type === 'tool-call' && p.id === toolId
            ? {
                ...p,
                status: 'complete' as const,
                result: payload.result,
                summary: payload.summary as string | undefined,
                durationS: payload.duration_s as number | undefined,
                inlineDiff: payload.inline_diff as string | undefined
              }
            : p
        )

        return { ...msg, parts }
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
          parts: [],
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
  let pendingToolParts: MobileMessagePart[] = []
  let activeAssistantIndex: number | null = null

  const clearPendingTools = () => {
    pendingToolParts = []
  }

  const appendPartsToActiveAssistant = (parts: MobileMessagePart[]): boolean => {
    if (activeAssistantIndex === null) return false
    const active = result[activeAssistantIndex]
    if (!active || active.role !== 'assistant') {
      activeAssistantIndex = null
      return false
    }
    active.parts = [...active.parts, ...parts]
    return true
  }

  const flushPendingTools = () => {
    if (!pendingToolParts.length) return
    if (!appendPartsToActiveAssistant(pendingToolParts)) {
      result.push({
        id: `msg-tools-${result.length}`,
        role: 'assistant',
        parts: pendingToolParts
      })
      activeAssistantIndex = result.length - 1
    }
    clearPendingTools()
  }

  for (let idx = 0; idx < raw.length; idx++) {
    const msg = raw[idx]
    if (msg.display_kind === 'hidden') continue

    // 1. Tool result messages (role === 'tool')
    if (msg.role === 'tool') {
      const toolId = msg.tool_call_id || undefined
      const toolName = msg.tool_name || msg.name || 'tool'
      const rawToolResult = msg.content ?? msg.text ?? msg.name ?? ''
      const toolResultContent = extractTextContent(rawToolResult)

      const pendingIndex = pendingToolParts.findIndex(
        p => p.type === 'tool-call' && ((toolId && p.id === toolId) || (!toolId && p.name === toolName))
      )
      if (pendingIndex >= 0) {
        const existing = pendingToolParts[pendingIndex] as Extract<MobileMessagePart, { type: 'tool-call' }>
        pendingToolParts[pendingIndex] = {
          ...existing,
          status: 'complete',
          result: msg.content ?? toolResultContent,
          summary: toolResultContent || undefined
        }
        continue
      }

      let matched = false
      for (let i = result.length - 1; i >= 0; i--) {
        const lastMsg = result[i]
        if (lastMsg.role === 'assistant') {
          const partIndex = lastMsg.parts.findIndex(
            p => p.type === 'tool-call' && ((toolId && p.id === toolId) || (!toolId && p.name === toolName))
          )
          if (partIndex >= 0) {
            const updatedParts = [...lastMsg.parts]
            const existing = updatedParts[partIndex] as Extract<MobileMessagePart, { type: 'tool-call' }>
            updatedParts[partIndex] = {
              ...existing,
              status: 'complete',
              result: msg.content ?? toolResultContent,
              summary: toolResultContent || undefined
            }
            result[i] = { ...lastMsg, parts: updatedParts }
            matched = true
            break
          }
        }
      }
      if (matched) continue
      continue
    }

    // 2. User & Assistant messages
    const displayContent = extractTextContent(msg.content ?? msg.text ?? msg.name ?? '')
    const reasoning = msg.reasoning || msg.reasoning_content || (
      typeof msg.display_metadata === 'object' && msg.display_metadata
        ? String((msg.display_metadata as Record<string, unknown>).reasoning || '')
        : undefined
    )

    const parts: MobileMessagePart[] = []

    if (reasoning && msg.role === 'assistant') {
      parts.push({ type: 'reasoning', reasoning })
    }

    if (displayContent) {
      parts.push({ type: 'text', text: displayContent })
    }

    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      msg.tool_calls.forEach((call: unknown, callIdx: number) => {
        const c = (typeof call === 'object' && call !== null ? call : {}) as Record<string, unknown>
        const fn = (typeof c.function === 'object' && c.function !== null ? c.function : {}) as Record<string, unknown>
        const id = String(c.id || c.tool_call_id || `tool-${idx}-${callIdx}`)
        const name = String(c.name || c.tool_name || fn.name || 'tool')
        const args = fn.arguments ?? c.arguments ?? c.args ?? c.input
        parts.push({
          type: 'tool-call',
          id,
          name,
          status: 'complete',
          args
        })
      })
    }

    if (!parts.length) {
      if (msg.role !== 'assistant') {
        flushPendingTools()
        activeAssistantIndex = null
      }
      continue
    }

    const isToolOnlyAssistant = msg.role === 'assistant' && parts.every(p => p.type === 'tool-call')

    if (isToolOnlyAssistant) {
      pendingToolParts = [...pendingToolParts, ...parts]
      continue
    }

    if (msg.role === 'assistant') {
      if (pendingToolParts.length) {
        if (!appendPartsToActiveAssistant(pendingToolParts)) {
          parts.unshift(...pendingToolParts)
        }
        clearPendingTools()
      }

      const activeAssistant = activeAssistantIndex !== null && result[activeAssistantIndex]?.role === 'assistant'
        ? result[activeAssistantIndex]
        : null

      const currentHasToolCall = parts.some(p => p.type === 'tool-call')
      const activeHasToolCall = Boolean(activeAssistant?.parts.some(p => p.type === 'tool-call'))

      if (activeAssistant && (currentHasToolCall || activeHasToolCall)) {
        activeAssistant.parts = [...activeAssistant.parts, ...parts]
        activeAssistant.timestamp = msg.timestamp ?? activeAssistant.timestamp
        continue
      }
    } else {
      flushPendingTools()
    }

    result.push({
      id: `msg-${msg.row_id ?? msg.id ?? result.length}`,
      role: msg.role,
      parts,
      timestamp: msg.timestamp,
      rowId: msg.row_id ?? msg.id
    })

    if (msg.role === 'assistant') {
      activeAssistantIndex = result.length - 1
    } else {
      activeAssistantIndex = null
    }
  }

  flushPendingTools()
  return result
}

function extractTextContent(value: unknown, depth = 0): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || value === undefined || depth > 3) {
    return ''
  }

  if (Array.isArray(value)) {
    return value
      .map(item => extractTextContent(item, depth + 1))
      .filter(Boolean)
      .join('\n')
  }

  if (typeof value === 'object') {
    const row = value as Record<string, unknown>
    const textValue = row.text ?? row.output_text ?? row.content ?? row.message ?? row.val
    const nestedText = extractTextContent(textValue, depth + 1)

    if (nestedText) {
      return nestedText
    }
  }

  return ''
}
