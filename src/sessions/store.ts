import type { GatewayEvent } from '@/shared'
import { atom } from 'nanostores'

import type { SessionInfo, SessionMessage, SessionMessagesResponse, SessionResumeResponse } from '@/types/hermes'
import type { MobileMessage, MobileMessagePart } from '@/types/mobile'
import * as api from '@/gateway/api'
import { onGatewayEvent, restorePendingSessionInputs } from '@/gateway'
import { translateNow } from '@/i18n'
import { getActiveProfile } from '@/gateway/http-client'

export const $sessions = atom<SessionInfo[]>([])
/** Source-scoped sidebar streams. They stay outside `$sessions` so a burst of
 * cron or messaging traffic cannot evict ordinary conversations from recents. */
export const $cronSessions = atom<SessionInfo[]>([])
export const $messagingSessions = atom<SessionInfo[]>([])
export const $sessionsLoading = atom(true)
export const $sessionsLoadingMore = atom(false)
export const $sessionsHasMore = atom(false)
export type SessionScope = 'active' | 'all'
export const $sessionScope = atom<SessionScope>('active')
const $sessionsNextOffset = atom(0)
export const $activeSessionId = atom<string | null>(null)
export const $activeRuntimeId = atom<string | null>(null)
export const $messages = atom<MobileMessage[]>([])
/** Whether the server has transcript rows older than the in-memory window. */
export const $messagesHasEarlier = atom(false)
export const $messagesLoadingEarlier = atom(false)
export const $busy = atom(false)
export const $awaitingResponse = atom(false)
export const $currentModel = atom('')
export const $currentProvider = atom('')
export const $currentReasoningEffort = atom('medium')
export const $currentFast = atom(false)
export const $currentCwd = atom('')
export const $sessionTitle = atom<string | null>(null)
export interface QueuedPrompt {
  attachments: NonNullable<SendMessageOptions['attachments']>
  id: string
  options: Omit<SendMessageOptions, 'attachments'>
  text: string
}
/** Queues are client-side but keyed by the durable Gateway session id, so a
 * desktop tab switch or mobile drawer does not lose a follow-up. */
export const $queuedPrompts = atom<Record<string, QueuedPrompt[]>>({})

export const MESSAGING_SOURCES = [
  'telegram', 'discord', 'slack', 'mattermost', 'matrix', 'signal', 'whatsapp',
  'bluebubbles', 'photon', 'homeassistant', 'email', 'sms', 'webhook',
  'api_server', 'weixin', 'wecom', 'wechat', 'wechatpad', 'qqbot', 'yuanbao', 'dingtalk', 'feishu'
]
export const MESSAGING_SOURCE_SET = new Set(MESSAGING_SOURCES)
export function isMessagingSessionSource(source?: string | null): boolean {
  return Boolean(source && MESSAGING_SOURCE_SET.has(source))
}
const RECENT_EXCLUDED_SOURCES = ['cron', 'kanban', 'subagent', 'tool', ...MESSAGING_SOURCES]
const MESSAGING_EXCLUDED_SOURCES = ['cron', 'cli', 'codex', 'desktop', 'gateway', 'kanban', 'local', 'tui']

let eventCleanup: (() => void) | null = null
let activeSessionGeneration = 0
let transcriptOffset = 0
let drainingQueuedPrompt = false
let queuedDrainTimer: ReturnType<typeof setTimeout> | null = null

/** Clear profile-scoped sidebar state before a connection/profile re-home.
 * Durable sessions remain on the Gateway; this only prevents profile A rows
 * from being rendered under profile B while the new index is loading. */
export function clearSessionLists(): void {
  $sessions.set([])
  $cronSessions.set([])
  $messagingSessions.set([])
  $sessionsNextOffset.set(0)
  $sessionsHasMore.set(false)
  $sessionsLoading.set(true)
  $sessionsLoadingMore.set(false)
}

export async function refreshSessions(): Promise<void> {
  $sessionsLoading.set(true)

  try {
    const scope = $sessionScope.get()
    const result = await api.listSidebarSessions({
      recentsProfile: scope === 'all' ? 'all' : getActiveProfile(),
      recentsLimit: 50,
      cronLimit: 30,
      messagingLimit: 50,
      recentsExclude: RECENT_EXCLUDED_SOURCES,
      messagingExclude: MESSAGING_EXCLUDED_SOURCES
    })
    $sessions.set(result.recents.sessions)
    $cronSessions.set(result.cron.sessions)
    $messagingSessions.set(result.messaging.sessions)
    // The batched endpoint deliberately avoids a costly exact total. A full
    // recents window is enough to offer another page; pagination below keeps
    // using the stable source filter.
    const nextOffset = result.recents.sessions.filter(session => !session.pinned).length
    $sessionsNextOffset.set(nextOffset)
    $sessionsHasMore.set(result.recents.sessions.length >= 50)
  } catch {
    // keep existing
  } finally {
    $sessionsLoading.set(false)
  }
}

export function setSessionScope(scope: SessionScope): void {
  if ($sessionScope.get() === scope) return
  $sessionScope.set(scope)
  void refreshSessions()
}

/** Fetch the next remote page without discarding the sidebar window. */
export async function loadMoreSessions(): Promise<void> {
  if ($sessionsLoadingMore.get() || !$sessionsHasMore.get()) return

  $sessionsLoadingMore.set(true)
  try {
    const current = $sessions.get()
    const result = $sessionScope.get() === 'all'
      ? await api.listAllProfileSessions(50, 'exclude', 'recent', $sessionsNextOffset.get(), { excludeSources: RECENT_EXCLUDED_SOURCES })
      : await api.listSessions(50, 'exclude', 'recent', $sessionsNextOffset.get(), { excludeSources: RECENT_EXCLUDED_SOURCES })
    const known = new Set(current.map(session => session.id))
    $sessions.set([...current, ...result.sessions.filter(session => !known.has(session.id))])
    const nextOffset = result.offset + result.limit
    $sessionsNextOffset.set(nextOffset)
    $sessionsHasMore.set(nextOffset < result.total)
  } catch {
    // Keep the loaded window and leave the control available for retry.
  } finally {
    $sessionsLoadingMore.set(false)
  }
}

export async function openSession(storedSessionId: string): Promise<void> {
  const generation = ++activeSessionGeneration
  $activeSessionId.set(storedSessionId)
  $messages.set([])
  $messagesHasEarlier.set(false)
  $messagesLoadingEarlier.set(false)
  transcriptOffset = 0
  $busy.set(false)
  $awaitingResponse.set(false)
  $sessionTitle.set($sessions.get().find(s => s.id === storedSessionId)?.title ?? null)
  // The backend owns unread state. Marking the active conversation read is
  // best-effort so older gateways remain compatible and the opening path is
  // never blocked on a cosmetic watermark write.
  void api.setSessionUnread(storedSessionId, false).then(() => {
    $sessions.set($sessions.get().map(session =>
      session.id === storedSessionId ? { ...session, unread: false } : session
    ))
  }).catch(() => undefined)

  eventCleanup?.()
  eventCleanup = onGatewayEvent(event => handleSessionEvent(event, generation))

  try {
    const resumeResult = await api.resumeSession(storedSessionId)

    if (generation !== activeSessionGeneration) {
      return
    }

    $activeRuntimeId.set(resumeResult.session_id)
    restorePendingSessionInputs(resumeResult.session_id, resumeResult)

    if (resumeResult.info) {
      $currentModel.set(resumeResult.info.model ?? '')
      $currentProvider.set(resumeResult.info.provider ?? '')
      $currentCwd.set(resumeResult.info.cwd ?? '')
      $currentFast.set(resumeResult.info.fast ?? false)
      $busy.set(resumeResult.info.running ?? false)
    }

    let restored: MobileMessage[] = []

    if (resumeResult.messages?.length && !resumeResult.messages_omitted) {
      restored = convertMessages(resumeResult.messages)
    } else {
      const transcript = await api.getSessionMessages(storedSessionId, {
        limit: 120,
        includeCompacted: true,
        order: 'latest'
      })

      if (generation !== activeSessionGeneration) {
        return
      }

      restored = convertMessages(transcript.messages)
      updateTranscriptWindow(transcript)
    }

    $messages.set(appendInflightProjection(restored, resumeResult))
    if (!resumeResult.info?.running) scheduleQueuedPromptDrain()
  } catch (_error) {
    if (generation !== activeSessionGeneration) {
      return
    }

    try {
      const transcript = await api.getSessionMessages(storedSessionId, {
        limit: 120,
        includeCompacted: true,
        order: 'latest'
      })

      if (generation === activeSessionGeneration) {
        $messages.set(convertMessages(transcript.messages))
        updateTranscriptWindow(transcript)
      }
    } catch {
      // session may not exist yet
    }
  }
}

/** Fork a conversation through the connected Gateway and focus the child.
 * The server owns transcript truncation, lineage, and profile routing. */
export async function branchStoredSession(storedSessionId: string): Promise<string | null> {
  try {
    const result = await api.branchSession(storedSessionId)
    const childId = result.stored_session_id ?? result.session_id
    if (!childId) return null
    await refreshSessions()
    await openSession(childId)
    return childId
  } catch {
    return null
  }
}

export function closeSession(): void {
  activeSessionGeneration++
  eventCleanup?.()
  eventCleanup = null
  $activeSessionId.set(null)
  $activeRuntimeId.set(null)
  $messages.set([])
  $messagesHasEarlier.set(false)
  $messagesLoadingEarlier.set(false)
  transcriptOffset = 0
  $busy.set(false)
  $awaitingResponse.set(false)
  $sessionTitle.set(null)
}

function updateTranscriptWindow(transcript: SessionMessagesResponse): void {
  const pagination = transcript.pagination

  if (!pagination) {
    transcriptOffset = transcript.messages.length
    $messagesHasEarlier.set(false)
    return
  }

  transcriptOffset = pagination.offset + pagination.returned
  $messagesHasEarlier.set(pagination.returned >= pagination.limit)
}

function messageKey(message: MobileMessage): string {
  return `${message.id}:${message.rowId ?? ''}`
}

/** Prepend one older REST page while retaining any live/in-flight tail. */
export async function loadEarlierMessages(): Promise<void> {
  const sessionId = $activeSessionId.get()
  const generation = activeSessionGeneration

  if (!sessionId || !$messagesHasEarlier.get() || $messagesLoadingEarlier.get()) {
    return
  }

  $messagesLoadingEarlier.set(true)

  try {
    const transcript = await api.getSessionMessages(sessionId, {
      limit: 120,
      offset: transcriptOffset,
      includeCompacted: true,
      order: 'latest'
    })

    if (generation !== activeSessionGeneration || sessionId !== $activeSessionId.get()) {
      return
    }

    const older = convertMessages(transcript.messages)
    const existing = new Set($messages.get().map(messageKey))
    const uniqueOlder = older.filter(message => !existing.has(messageKey(message)))
    $messages.set([...uniqueOlder, ...$messages.get()])
    updateTranscriptWindow(transcript)
  } catch {
    // Keep the button available for a retry; the current transcript remains usable.
  } finally {
    $messagesLoadingEarlier.set(false)
  }
}

/** Sync latest transcript messages from gateway database. */
export async function syncActiveSessionMessages(): Promise<void> {
  const sessionId = $activeSessionId.get()
  const generation = activeSessionGeneration
  if (!sessionId) return

  try {
    const transcript = await api.getSessionMessages(sessionId, {
      limit: 120,
      includeCompacted: true,
      order: 'latest'
    })

    if (generation !== activeSessionGeneration || sessionId !== $activeSessionId.get()) {
      return
    }

    const serverMessages = convertMessages(transcript.messages)
    if (serverMessages.length > 0) {
      $messages.set(serverMessages)
      updateTranscriptWindow(transcript)
    }
  } catch {
    // best effort
  }
}

export interface SendMessageOptions {
  model?: string
  provider?: string
  reasoningEffort?: string
  attachments?: Array<{ data_url: string; filename: string }>
  truncateBeforeUserOrdinal?: number
}

export function enqueuePrompt(text: string, options: SendMessageOptions = {}): boolean {
  const sessionId = $activeSessionId.get()
  const trimmed = text.trim()
  if (!sessionId || !trimmed) return false
  const entry: QueuedPrompt = {
    attachments: options.attachments ?? [],
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    options: {
      model: options.model,
      provider: options.provider,
      reasoningEffort: options.reasoningEffort
    },
    text: trimmed
  }
  $queuedPrompts.set({
    ...$queuedPrompts.get(),
    [sessionId]: [...($queuedPrompts.get()[sessionId] ?? []), entry]
  })
  return true
}

export function removeQueuedPrompt(sessionId: string, entryId: string): void {
  const current = $queuedPrompts.get()
  const next = (current[sessionId] ?? []).filter(entry => entry.id !== entryId)
  const updated = { ...current }
  if (next.length) updated[sessionId] = next
  else delete updated[sessionId]
  $queuedPrompts.set(updated)
}

/** Explicit resume for a queued follow-up after a transient Gateway failure. */
export function drainQueuedPromptsNow(): void {
  scheduleQueuedPromptDrain()
}

async function drainQueuedPrompt(): Promise<void> {
  if (drainingQueuedPrompt || $busy.get()) return
  const sessionId = $activeSessionId.get()
  if (!sessionId) return
  const entry = $queuedPrompts.get()[sessionId]?.[0]
  if (!entry) return

  drainingQueuedPrompt = true
  try {
    const accepted = await sendMessage(entry.text, { ...entry.options, attachments: entry.attachments })
    if (accepted) removeQueuedPrompt(sessionId, entry.id)
  } finally {
    drainingQueuedPrompt = false
  }
}

/** Completion and `running:false` can arrive as adjacent WS events. Let that
 * terminal pair settle before submitting the next entry, rather than letting a
 * stale status event flip a just-started queued turn back to idle. */
function scheduleQueuedPromptDrain(): void {
  if (queuedDrainTimer) return
  const targetSessionId = $activeSessionId.get()
  queuedDrainTimer = setTimeout(() => {
    queuedDrainTimer = null
    if (targetSessionId === $activeSessionId.get()) void drainQueuedPrompt()
  }, 40)
}

export async function sendMessage(
  text: string,
  options?: SendMessageOptions
): Promise<boolean> {
  const runtimeId = $activeRuntimeId.get()
  const storedSessionId = $activeSessionId.get()
  const generation = activeSessionGeneration

  if (!runtimeId || !storedSessionId || !text.trim()) {
    return false
  }

  const userMessage: MobileMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    parts: [{ type: 'text', text: text.trim() }],
    timestamp: Date.now() / 1000
  }

  // A fresh user message may never land after a still-pending assistant
  // bubble — settle any leftover (drop it when empty) before appending, or a
  // stale spinner gets stranded mid-transcript above this message forever.
  $messages.set([...finalizeInterruptedMessages($messages.get()), userMessage])
  $busy.set(true)
  $awaitingResponse.set(true)

  try {
    await submitPromptWithRecovery(runtimeId, storedSessionId, text.trim(), options)
    void syncActiveSessionMessages()
    return true
  } catch (error) {
    if (generation !== activeSessionGeneration || storedSessionId !== $activeSessionId.get()) {
      return false
    }

    $busy.set(false)
    $awaitingResponse.set(false)

    $messages.set($messages.get().map(message =>
      message.id === userMessage.id ? { ...message, failed: true } : message
    ))

    const rawMessage = error instanceof Error ? error.message : 'Failed to send message'

    const errorMessage: MobileMessage = {
      id: `error-${Date.now()}`,
      role: 'assistant',
      parts: [],
      error: friendlyErrorText(rawMessage),
      retryText: text.trim(),
      retryUserMessageId: userMessage.id,
      timestamp: Date.now() / 1000
    }

    $messages.set([...$messages.get(), errorMessage])
    return false
  }
}

export async function retryMessage(errorMessageId: string, text: string, userMessageId?: string): Promise<void> {
  $messages.set($messages.get().filter(message =>
    message.id !== errorMessageId && message.id !== userMessageId
  ))
  await sendMessage(text)
}

/** Redirect an in-flight Gateway turn with a text-only correction. The old
 * reply remains visible, while the Gateway starts (or queues) the correction
 * at the next safe model boundary. */
export async function redirectMessage(text: string): Promise<boolean> {
  const runtimeId = $activeRuntimeId.get()
  const storedSessionId = $activeSessionId.get()
  const trimmed = text.trim()
  if (!runtimeId || !storedSessionId || !trimmed || !$busy.get()) return false

  const message: MobileMessage = {
    id: `redirect-${Date.now()}`,
    role: 'user',
    parts: [{ type: 'text', text: trimmed }],
    timestamp: Date.now() / 1000
  }
  $messages.set([...finalizeInterruptedMessages($messages.get()), message])

  try {
    let result: { status?: 'queued' | 'redirected' | 'rejected' }
    try {
      result = await api.redirectSession(runtimeId, trimmed)
    } catch (error) {
      if (!/session not found/i.test(error instanceof Error ? error.message : String(error))) throw error
      // A websocket reconnect can leave a stale runtime id while the stored
      // session remains valid. Re-resume once before treating it as failed.
      const resumed = await api.resumeSession(storedSessionId, { omitMessages: true })
      $activeRuntimeId.set(resumed.session_id)
      result = await api.redirectSession(resumed.session_id, trimmed)
    }
    if (result.status === 'redirected' || result.status === 'queued') return true
  } catch {
    // The optimistic row is removed below; the composer retains its draft.
  }

  $messages.set($messages.get().filter(candidate => candidate.id !== message.id))
  return false
}

export function appendSystemMessage(text: string): void {
  const message: MobileMessage = {
    id: `system-${Date.now()}`,
    role: 'assistant',
    parts: [{ type: 'text', text }],
    timestamp: Date.now() / 1000
  }

  $messages.set([...$messages.get(), message])
}

function messageText(message: MobileMessage): string {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .trim()
}

function hasVisibleContent(message: MobileMessage): boolean {
  return message.parts.some(
    part =>
      (part.type === 'text' && part.text.trim().length > 0) || part.type === 'tool-call' || part.type === 'reasoning'
  )
}

/* Port of Desktop rewind.ts finalizeInterruptedMessages: drop empty pending
 * placeholders and un-pend the rest. A turn ending without message.complete
 * (crash, reconnect gap) must not strand a thinking spinner mid-transcript. */
function finalizeInterruptedMessages(messages: MobileMessage[]): MobileMessage[] {
  let changed = false

  const next = messages.reduce<MobileMessage[]>((acc, message) => {
    if (message.pending && !hasVisibleContent(message)) {
      changed = true
      return acc
    }

    if (message.pending) {
      changed = true
      acc.push({ ...message, pending: false })
      return acc
    }

    acc.push(message)
    return acc
  }, [])

  return changed ? next : messages
}

/* Port of Desktop store/notifications.ts isDiskFullErrorMessage. */
export function isDiskFullErrorMessage(message: string): boolean {
  return (
    /no space left on device/i.test(message) ||
    /not enough space/i.test(message) ||
    /database or disk is full/i.test(message) ||
    /\bENOSPC\b/i.test(message) ||
    /disk full/i.test(message) ||
    /full disk/i.test(message)
  )
}

function friendlyErrorText(raw: string): string {
  return isDiskFullErrorMessage(raw) ? translateNow().errors.diskFull : raw
}

function userOrdinalAt(messages: MobileMessage[], index: number): number {
  let ordinal = 0

  for (let i = 0; i < index; i++) {
    if (messages[i].role === 'user') {
      ordinal++
    }
  }

  return ordinal
}

/* Edit + resend (Desktop rewind.ts port): truncate the transcript at the
 * edited user turn and resubmit. Failed turns never reached the gateway, so
 * they resubmit plainly instead of truncating by ordinal. */
export async function editAndResend(messageId: string, newText: string): Promise<void> {
  const runtimeId = $activeRuntimeId.get()
  const storedSessionId = $activeSessionId.get()
  const generation = activeSessionGeneration
  const trimmed = newText.trim()

  if (!runtimeId || !storedSessionId || !trimmed) {
    return
  }

  const messages = $messages.get()
  const sourceIndex = messages.findIndex(m => m.id === messageId && m.role === 'user')

  if (sourceIndex < 0) {
    return
  }

  const source = messages[sourceIndex]

  if (messageText(source) === trimmed) {
    return
  }

  const next = messages[sourceIndex + 1]
  const isFailedTurn = source.failed === true || (next?.role === 'assistant' && Boolean(next.error))
  const wasBusy = $busy.get()

  const editedMessage: MobileMessage = { ...source, parts: [{ type: 'text', text: trimmed }] }

  $messages.set([...messages.slice(0, sourceIndex), editedMessage])
  $busy.set(true)
  $awaitingResponse.set(true)

  try {
    if (wasBusy) {
      try {
        await api.interruptSession(runtimeId)
      } catch {
        // best effort — submit still gates on gateway state
      }
    }

    await submitPromptWithRecovery(runtimeId, storedSessionId, trimmed, {
      truncateBeforeUserOrdinal: isFailedTurn ? undefined : userOrdinalAt(messages, sourceIndex)
    })
  } catch (error) {
    if (generation !== activeSessionGeneration || storedSessionId !== $activeSessionId.get()) {
      return
    }

    $busy.set(false)
    $awaitingResponse.set(false)

    const errorMessage: MobileMessage = {
      id: `error-${Date.now()}`,
      role: 'assistant',
      parts: [],
      error: error instanceof Error ? error.message : 'Failed to send message',
      retryText: trimmed,
      timestamp: Date.now() / 1000
    }

    $messages.set([...$messages.get(), errorMessage])
  }
}

/* Slash command dispatch — mirrors Desktop's use-prompt-actions/slash.ts:
 * run via slash.exec; a `send` dispatch submits the returned message as a
 * normal turn, plain output renders inline as a system message. */
export async function sendSlashCommand(command: string): Promise<void> {
  const runtimeId = $activeRuntimeId.get()
  const storedSessionId = $activeSessionId.get()

  if (!runtimeId || !storedSessionId || !command.trim()) {
    return
  }

  const userMessage: MobileMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    parts: [{ type: 'text', text: command.trim() }],
    timestamp: Date.now() / 1000
  }

  $messages.set([...$messages.get(), userMessage])

  try {
    const result = await api.execSlash(runtimeId, command.trim())

    if (storedSessionId !== $activeSessionId.get()) {
      return
    }

    if (result?.type === 'send' && result.message) {
      await sendMessage(result.message)
      return
    }

    const body = result?.output || `${command.trim().split(/\s/)[0]}: no output`
    appendSystemMessage(result?.warning ? `warning: ${result.warning}\n${body}` : body)
  } catch (error) {
    if (storedSessionId !== $activeSessionId.get()) {
      return
    }

    appendSystemMessage(`error: ${error instanceof Error ? error.message : String(error)}`)
  }
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

  const resumed = await api.resumeSession(storedSessionId, { omitMessages: true })
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
    $messagesHasEarlier.set(false)
    $messagesLoadingEarlier.set(false)
    transcriptOffset = 0
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
  'mcp.setup.request',
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

function extractDeltaText(payload: Record<string, unknown>): string {
  if (typeof payload.text === 'string' && payload.text) return payload.text
  if (typeof payload.content === 'string' && payload.content) return payload.content
  if (typeof payload.delta === 'string' && payload.delta) return payload.delta
  if (payload.delta && typeof payload.delta === 'object') {
    const d = payload.delta as Record<string, unknown>
    if (typeof d.text === 'string' && d.text) return d.text
    if (typeof d.content === 'string' && d.content) return d.content
  }
  if (Array.isArray(payload.choices) && payload.choices[0]) {
    const choice = payload.choices[0] as Record<string, unknown>
    const delta = choice.delta as Record<string, unknown> | undefined
    if (delta) {
      if (typeof delta.content === 'string') return delta.content
      if (typeof delta.text === 'string') return delta.text
    }
    if (typeof choice.text === 'string') return choice.text
  }
  if (typeof payload.chunk === 'string' && payload.chunk) return payload.chunk
  if (typeof payload.output_text === 'string' && payload.output_text) return payload.output_text
  if (typeof payload.message === 'string' && payload.message) return payload.message
  if (payload.message && typeof payload.message === 'object') {
    const m = payload.message as Record<string, unknown>
    if (typeof m.content === 'string') return m.content
    if (typeof m.text === 'string') return m.text
  }
  return ''
}

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

    case 'message.delta':
    case 'message.interim':
    case 'text.delta':
    case 'content.delta':
    case 'response.delta':
    case 'stream.delta': {
      const text = extractDeltaText(payload)

      if (!text) {
        break
      }

      const updated = [...messages]
      const last = updated[updated.length - 1]

      if (!last || last.role !== 'assistant') {
        const assistantMsg: MobileMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          parts: [{ type: 'text', text }],
          timestamp: Date.now() / 1000,
          pending: true
        }
        updated.push(assistantMsg)
        $messages.set(updated)
        $awaitingResponse.set(false)
        break
      }

      const parts = [...last.parts]
      const lastPart = parts[parts.length - 1]
      if (lastPart && lastPart.type === 'text') {
        parts[parts.length - 1] = { ...lastPart, text: lastPart.text + text }
      } else {
        parts.push({ type: 'text', text })
      }
      updated[updated.length - 1] = { ...last, parts }
      $messages.set(updated)
      $awaitingResponse.set(false)
      break
    }

    case 'message.complete': {
      $busy.set(false)
      $awaitingResponse.set(false)

      const finalText = extractDeltaText(payload)
      const currentMessages = $messages.get()
      const updated = currentMessages.map(msg => {
        if (!msg.pending) return msg
        const newMsg = { ...msg, pending: false }
        if (finalText && !newMsg.parts.some(p => p.type === 'text')) {
          newMsg.parts = [...newMsg.parts, { type: 'text', text: finalText }]
        }
        return newMsg
      })
      $messages.set(updated)
      void refreshSessions()
      void syncActiveSessionMessages()
      scheduleQueuedPromptDrain()
      break
    }

    case 'thinking.delta':
    case 'reasoning.delta': {
      const text = extractDeltaText(payload) || String(payload.text ?? '')

      if (!text) {
        break
      }

      const updated = [...messages]
      const last = updated[updated.length - 1]

      if (!last || last.role !== 'assistant') {
        const assistantMsg: MobileMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          parts: [{ type: 'reasoning', reasoning: text }],
          timestamp: Date.now() / 1000,
          pending: true
        }
        updated.push(assistantMsg)
        $messages.set(updated)
        $awaitingResponse.set(false)
        break
      }

      const parts = [...last.parts]
      const lastPart = parts[parts.length - 1]
      if (lastPart && lastPart.type === 'reasoning') {
        parts[parts.length - 1] = { ...lastPart, reasoning: lastPart.reasoning + text }
      } else {
        parts.push({ type: 'reasoning', reasoning: text })
      }
      updated[updated.length - 1] = { ...last, parts }
      $messages.set(updated)
      $awaitingResponse.set(false)
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

      if (typeof payload.fast === 'boolean') {
        $currentFast.set(payload.fast)
      }

      if (typeof payload.running === 'boolean') {
        $busy.set(payload.running)

        // The turn is over but its streaming bubble may still say pending —
        // running=false from the agent loop's finally block is the ONLY settle
        // signal when message.complete never arrives (turn crash, reconnect
        // gap). finalizeInterruptedMessages un-pends kept text and drops empty
        // placeholders; on the normal path message.complete already settled
        // everything and this is a no-op. (Desktop gateway-event.ts parity.)
        if (!payload.running) {
          $awaitingResponse.set(false)
          $messages.set(finalizeInterruptedMessages($messages.get()))
          void syncActiveSessionMessages()
          scheduleQueuedPromptDrain()
        }
      }
      break
    }

    case 'session.reclaimed': {
      // The backend reclaimed the live session (idle TTL / LRU cap / WS-orphan
      // reap). The stored row is untouched — keep the transcript, drop the live
      // turn state; the next send re-binds via submitPromptWithRecovery.
      $busy.set(false)
      $awaitingResponse.set(false)
      $messages.set(finalizeInterruptedMessages($messages.get()))
      scheduleQueuedPromptDrain()
      break
    }

    case 'session.info': {
      const storedId = payload.stored_session_id as string | undefined

      if (storedId && storedId !== $activeSessionId.get()) {
        $activeSessionId.set(storedId)
      }

      if (typeof payload.fast === 'boolean') {
        $currentFast.set(payload.fast)
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

      const errorText = friendlyErrorText(String(payload.message ?? payload.error ?? 'Unknown error'))
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

/* Port of Desktop utils.ts appendLiveSessionProjection (simplified): paint the
 * gateway's live-turn projection — the in-flight user turn, the streaming
 * assistant bubble, or a queued user message — that the persisted transcript
 * does not carry yet. Without it, reopening a running session shows none of
 * the in-progress reply. */
function appendInflightProjection(messages: MobileMessage[], resume: SessionResumeResponse): MobileMessage[] {
  const inflight = resume.inflight
  const queuedUser = resume.queued?.user?.trim()

  if (!inflight && !queuedUser) {
    return messages
  }

  const projected: MobileMessage[] = [...messages]
  const now = Date.now() / 1000

  const inflightUser = inflight?.user?.trim()

  if (inflightUser) {
    const alreadyPersisted = projected.some(
      message => message.role === 'user' && messageText(message) === inflightUser
    )

    if (!alreadyPersisted) {
      projected.push({
        id: `inflight-user-${Date.now()}`,
        role: 'user',
        parts: [{ type: 'text', text: inflightUser }],
        timestamp: now
      })
    }
  }

  const inflightAssistant = inflight?.assistant ?? ''
  const inflightStreaming = inflight?.streaming === true
  const inflightError = inflight?.error?.trim()

  if (inflightAssistant || inflightStreaming || inflightError) {
    projected.push({
      id: `inflight-assistant-${Date.now()}`,
      role: 'assistant',
      parts: inflightAssistant ? [{ type: 'text', text: inflightAssistant }] : [],
      pending: inflightStreaming,
      ...(inflightError ? { error: friendlyErrorText(inflightError) } : {}),
      timestamp: now
    })
  }

  if (queuedUser) {
    projected.push({
      id: `queued-user-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text: queuedUser }],
      timestamp: now
    })
  }

  return projected
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

      // Newer gateways may project tool arguments directly on the tool row
      // instead of returning a separate assistant.tool_calls row. Preserve
      // that information so mobile can still render an expandable tool card.
      if (msg.args !== undefined) {
        result.push({
          id: `msg-${msg.row_id ?? msg.id ?? result.length}`,
          role: 'assistant',
          parts: [{
            type: 'tool-call',
            id: toolId ?? `tool-${idx}`,
            name: toolName,
            status: 'complete',
            args: msg.args,
            result: msg.content ?? toolResultContent,
            summary: toolResultContent || undefined
          }],
          timestamp: msg.timestamp,
          rowId: msg.row_id ?? msg.id
        })
      }
      continue
    }

    // 2. User & Assistant messages
    const displayContent = extractTextContent(msg.display_content ?? msg.content ?? msg.text ?? msg.name ?? '')
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
