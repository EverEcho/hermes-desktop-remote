import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import {
  $messages,
  $busy,
  $awaitingResponse,
  $messagesHasEarlier,
  $messagesLoadingEarlier,
  $sessionLoading,
  editAndResend,
  loadEarlierMessages,
  retryMessage,
  stopGeneration
} from './store'
import type { MobileMessage, MobileMessagePart } from '@/types/mobile'
import { MobileComposer } from '@/components/MobileComposer'
import { cn } from '@/ui/utils'
import { MarkdownContent } from '@/components/MarkdownContent'
import { Codicon } from '@/ui/Codicon'
import { ToolIcon } from '@/ui/ToolIcon'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { Button } from '@/ui/Button'
import * as api from '@/gateway/api'
import { useI18n, type Catalog } from '@/i18n'

interface SessionDetailProps {
  sessionId: string
  onPreview?: (target: { kind: 'file' | 'url'; value: string }) => void
}

interface SessionScrollPosition {
  atBottom: boolean
  top: number
}

const sessionScrollPositions = new Map<string, SessionScrollPosition>()
const BOTTOM_THRESHOLD_PX = 80

export function SessionDetail({ sessionId, onPreview }: SessionDetailProps) {
  const { t } = useI18n()
  const messages = useStore($messages)
  const busy = useStore($busy)
  const awaitingResponse = useStore($awaitingResponse)
  const hasEarlier = useStore($messagesHasEarlier)
  const loadingEarlier = useStore($messagesLoadingEarlier)
  const sessionLoading = useStore($sessionLoading)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const pendingScrollRestore = useRef<SessionScrollPosition | null>(null)
  const [showScrollToLatest, setShowScrollToLatest] = useState(false)
  const [editingMessage, setEditingMessage] = useState<MobileMessage | null>(null)

  useEffect(() => {
    pendingScrollRestore.current = sessionScrollPositions.get(sessionId) ?? { atBottom: true, top: 0 }
    userScrolledUp.current = !pendingScrollRestore.current.atBottom
    setShowScrollToLatest(!pendingScrollRestore.current.atBottom)
  }, [sessionId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || messages.length === 0) return
    const restore = pendingScrollRestore.current

    const frame = requestAnimationFrame(() => {
      if (restore) {
        el.scrollTop = restore.atBottom ? el.scrollHeight : Math.min(restore.top, el.scrollHeight - el.clientHeight)
        pendingScrollRestore.current = null
      } else if (!userScrolledUp.current) {
        el.scrollTop = el.scrollHeight
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [messages, sessionId])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX
    userScrolledUp.current = !atBottom
    setShowScrollToLatest(!atBottom)
    sessionScrollPositions.set(sessionId, { atBottom, top: el.scrollTop })
  }

  const scrollToBottom = () => {
    userScrolledUp.current = false
    setShowScrollToLatest(false)
    sessionScrollPositions.set(sessionId, { atBottom: true, top: 0 })
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  const runningTool = messages
    .flatMap(m => m.parts ?? [])
    .filter((p): p is Extract<MobileMessagePart, { type: 'tool-call' }> => p.type === 'tool-call' && p.status === 'running')
    .pop()
  const messageGroups = groupMessagesByTurn(messages)

  return (
    <div className="h-full flex flex-col relative bg-(--ui-bg-chrome)">
      {sessionLoading && messages.length > 0 ? (
        <div className="absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-(--ui-stroke-quaternary)" role="progressbar" aria-label={t.session.loadingConversation}>
          <div className="h-full w-1/3 animate-pulse rounded-full bg-(--ui-accent)" />
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="conversation-scroll flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-5 max-w-4xl mx-auto w-full"
        onScroll={handleScroll}
      >
        {hasEarlier && (
          <button
            className="mx-auto mb-2 block rounded-md bg-(--ui-bg-quaternary) px-3 py-1.5 text-xs text-(--ui-text-secondary) disabled:opacity-50"
            disabled={loadingEarlier}
            onClick={async () => {
              const el = scrollRef.current
              const previousHeight = el?.scrollHeight ?? 0
              await loadEarlierMessages()
              if (el) {
                el.scrollTop += el.scrollHeight - previousHeight
              }
            }}
          >
            {loadingEarlier ? t.common.loading : t.session.loadEarlier}
          </button>
        )}
        {messages.length === 0 && sessionLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-20 text-center" role="status">
            <Codicon name="loading" className="animate-spin text-lg text-(--ui-accent)" />
            <p className="text-xs text-(--ui-text-tertiary)">{t.session.loadingConversation}</p>
          </div>
        )}
        {messages.length === 0 && !busy && !sessionLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <Codicon name="robot" className="text-3xl text-(--ui-text-quaternary) mb-2" />
            <p className="text-xs text-(--ui-text-tertiary)">{t.session.emptyHint}</p>
          </div>
        )}

        {messageGroups.map((group, index) => (
          <div
            key={group[0].id}
            className={cn(
              'conversation-turn flex min-w-0 flex-col gap-1.5 pb-2',
              index < messageGroups.length - 3 && 'is-virtualized'
            )}
          >
            {group.map(msg => (
              <MessageRow
                key={msg.id}
                message={msg}
                onEditUser={msg.role === 'user' ? () => setEditingMessage(msg) : undefined}
                onPreview={onPreview}
              />
            ))}
          </div>
        ))}

        {(busy || awaitingResponse) && (
          <div className="flex items-center justify-between rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) p-3 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <Codicon
                name={runningTool ? 'tools' : 'sparkle'}
                className="text-sm text-(--ui-accent) animate-spin shrink-0"
              />
              <div className="min-w-0">
                <span className="block truncate text-xs font-medium text-(--ui-text-primary)">
                  {runningTool ? `${t.session.ranTool(runningTool.name)}…` : t.session.thinking}
                </span>
                {runningTool && extractFilePath(runningTool.args) ? (
                  <span className="block truncate font-mono text-[0.65rem] text-(--ui-text-tertiary)">
                    {extractFilePath(runningTool.args)}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              className="ml-3 flex items-center gap-1 rounded-md bg-(--ui-red)/10 px-2.5 py-1 text-xs font-medium text-(--ui-red) hover:bg-(--ui-red)/20 transition-colors"
              onClick={() => void stopGeneration()}
              type="button"
            >
              <Codicon name="debug-stop" className="text-xs" />
              <span>{t.common.cancel}</span>
            </button>
          </div>
        )}

        <div className="h-4" />
      </div>

      {showScrollToLatest && (
        <button
          className="absolute bottom-32 right-4 size-9 rounded-full border border-(--ui-stroke-secondary) shadow-(--shadow-nous) bg-(--ui-bg-elevated) grid place-items-center text-(--ui-text-secondary) z-30 hover:text-(--ui-text-primary) active:scale-95 transition-all"
          onClick={scrollToBottom}
          aria-label={t.session.scrollToLatest}
          title={t.session.scrollToLatest}
        >
          <Codicon name="chevron-down" className="text-sm" />
        </button>
      )}

      <MobileComposer busy={busy} onStop={() => void stopGeneration()} />

      {editingMessage && (
        <EditMessageSheet message={editingMessage} onClose={() => setEditingMessage(null)} />
      )}
    </div>
  )
}

/* Port of Desktop thread/list.tsx buildGroups: group each user message with
 * the assistant turns that follow it so the sticky human bubble pins against
 * the scroller only across its OWN turn — the next turn's wrapper bottom edge
 * pushes the parked bubble up instead of the next user bubble overlapping it. */
function groupMessagesByTurn(messages: MobileMessage[]): MobileMessage[][] {
  const groups: MobileMessage[][] = []
  let current: MobileMessage[] | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      current = [message]
      groups.push(current)
    } else if (current) {
      current.push(message)
    } else {
      groups.push([message])
    }
  }

  return groups
}

function EditMessageSheet({ message, onClose }: { message: MobileMessage; onClose: () => void }) {
  const { t } = useI18n()
  const [text, setText] = useState(() => message.parts?.find(p => p.type === 'text')?.text ?? '')

  return (
    <ResponsiveSheet open onClose={onClose} title={t.session.editMessage}>
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          autoFocus
          className="w-full resize-none rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) p-2.5 text-xs leading-relaxed text-(--ui-text-primary) focus:outline-none focus:border-(--ui-accent)"
        />
        <Button
          className="w-full"
          disabled={!text.trim()}
          onClick={() => {
            void editAndResend(message.id, text)
            onClose()
          }}
        >
          {t.session.saveAndSend}
        </Button>
      </div>
    </ResponsiveSheet>
  )
}

function ProcessNotificationNote({ text }: { text: string }) {
  const body = text.replace(/^\[IMPORTANT:\s*/, '').replace(/\]$/, '')
  const newline = body.indexOf('\n')
  const headline = (newline === -1 ? body : body.slice(0, newline)).trim()
  const detail = newline === -1 ? '' : body.slice(newline + 1).trim()

  return (
    <div className="my-2 max-w-4xl mx-auto w-full rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card)/70 p-2.5 text-xs text-(--ui-text-tertiary) shadow-xs">
      <div className="flex items-center gap-2 font-medium text-(--ui-text-secondary)">
        <Codicon name="history" className="text-sm text-(--ui-accent) shrink-0" />
        <span className="truncate flex-1">{headline}</span>
      </div>
      {detail && (
        <details className="mt-1.5 pl-5">
          <summary className="cursor-pointer select-none text-[0.68rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary) font-medium">
            指令详情与参数
          </summary>
          <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-(--ui-bg-chrome)/70 border border-(--ui-stroke-quaternary) p-2 font-mono text-[0.68rem] text-(--ui-text-tertiary) no-scrollbar">
            {detail}
          </pre>
        </details>
      )}
    </div>
  )
}

function UserMessageText({ text }: { text: string }) {
  if (text.includes('```')) {
    const parts = text.split(/(```[\s\S]*?```)/g)
    return (
      <div className="text-[length:var(--conversation-text-font-size)] leading-[var(--conversation-line-height)] text-(--ui-text-primary) wrap-anywhere font-sans">
        {parts.map((part, i) => {
          if (part.startsWith('```') && part.endsWith('```')) {
            const lines = part.slice(3, -3).replace(/^\w*\n/, '')
            return (
              <pre
                key={i}
                className="my-1.5 max-w-full overflow-x-auto rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-chrome)/60 px-2.5 py-1.5 font-mono text-[0.75rem] leading-snug text-(--ui-text-primary)"
              >
                <code>{lines}</code>
              </pre>
            )
          }
          return (
            <span key={i} className="whitespace-pre-wrap">
              {part}
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="text-[length:var(--conversation-text-font-size)] leading-[var(--conversation-line-height)] text-(--ui-text-primary) wrap-anywhere whitespace-pre-wrap font-sans">
      {text}
    </div>
  )
}

function UserMessageRow({
  message,
  onEditUser,
  onPreview: _onPreview
}: {
  message: MobileMessage
  onEditUser?: () => void
  onPreview?: (target: { kind: 'file' | 'url'; value: string }) => void
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const textPart = message.parts?.find(p => p.type === 'text')?.text || ''

  if (textPart.startsWith('[CONTEXT COMPACTION') || textPart.startsWith('[SYSTEM]')) {
    return (
      <div className="my-2 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) p-3 text-xs text-(--ui-text-tertiary) leading-relaxed">
        {textPart}
      </div>
    )
  }

  if (
    textPart.startsWith('[IMPORTANT: Background process') ||
    textPart.startsWith('[IMPORTANT: You are running as a scheduled cron job') ||
    (textPart.startsWith('[IMPORTANT:') && (textPart.includes('DELIVERY:') || textPart.includes('SILENT:')))
  ) {
    return <ProcessNotificationNote text={textPart} />
  }

  const isLong = textPart.length > 300 || (textPart.match(/\n/g) || []).length >= 4

  const handleCopy = () => {
    void navigator.clipboard.writeText(textPart)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group/user-msg sticky top-0 z-10 w-full bg-(--ui-bg-chrome) py-1">
      <div
        className={cn(
          'composer-human-message relative w-full rounded-xl border bg-(--dt-user-bubble) px-3.5 py-2.5 text-left shadow-xs transition-colors',
          message.failed ? 'border-(--ui-red)' : 'border-(--dt-user-bubble-border) hover:border-(--ui-stroke-secondary)'
        )}
      >
        <div className={cn('pr-14', isLong && !expanded && 'max-h-28 overflow-hidden relative')}>
          <UserMessageText text={textPart} />
          {isLong && !expanded && (
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-(--dt-user-bubble) to-transparent pointer-events-none" />
          )}
        </div>

        {isLong && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-[0.68rem] text-(--ui-accent) hover:underline select-none font-medium"
            >
              {expanded ? t.common.collapse : t.common.expand}
            </button>
          </div>
        )}

        {/* Discreet hover action toolbar in top-right corner */}
        <div className="message-hover-actions absolute right-2 top-2 z-10 flex items-center gap-0.5 opacity-0 group-hover/user-msg:opacity-100 group-focus-within/user-msg:opacity-100 transition-opacity bg-(--dt-user-bubble)/90 backdrop-blur-xs rounded-md p-0.5 border border-(--ui-stroke-quaternary)/50 shadow-xs">
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? t.common.copied : t.common.copy}
            className="size-6 rounded grid place-items-center text-(--ui-text-quaternary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
          >
            <Codicon name={copied ? 'check' : 'copy'} className="text-xs" />
          </button>
          {onEditUser && (
            <button
              type="button"
              onClick={onEditUser}
              title={t.session.editMessage}
              className="size-6 rounded grid place-items-center text-(--ui-text-quaternary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
            >
              <Codicon name="edit" className="text-xs" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AssistantActionBar({
  text,
  onRetry
}: {
  text: string
  onRetry?: () => void
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [working, setWorking] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null }, [])

  if (!text.trim()) return null

  const handleCopy = () => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toggleSpeak = async () => {
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    setWorking(true)
    try {
      const result = await api.speakText(text)
      if (!result.ok || !result.data_url) throw new Error('Gateway did not return audio')
      audioRef.current?.pause()
      const audio = new Audio(result.data_url)
      audioRef.current = audio
      audio.onended = () => setPlaying(false)
      audio.onerror = () => setPlaying(false)
      await audio.play()
      setPlaying(true)
    } catch {
      // best effort
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="message-hover-actions flex items-center justify-end gap-1 pt-1 opacity-0 group-hover/assistant:opacity-100 group-focus-within/assistant:opacity-100 transition-opacity select-none">
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? t.common.copied : t.common.copy}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.68rem] text-(--ui-text-quaternary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors"
      >
        <Codicon name={copied ? 'check' : 'copy'} className="text-xs" />
        <span>{copied ? t.common.copied : t.common.copy}</span>
      </button>

      <button
        type="button"
        disabled={working}
        onClick={() => void toggleSpeak()}
        title={working ? '准备中…' : playing ? '停止朗读' : '朗读'}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.68rem] text-(--ui-text-quaternary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors"
      >
        <Codicon name={working ? 'loading' : playing ? 'mute' : 'unmute'} className={cn('text-xs', working && 'animate-spin')} />
        <span>{playing ? '停止' : '朗读'}</span>
      </button>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          title={t.session.retrySend}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.68rem] text-(--ui-text-quaternary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors"
        >
          <Codicon name="refresh" className="text-xs" />
          <span>{t.session.retrySend}</span>
        </button>
      )}
    </div>
  )
}

function MessageRow({
  message,
  onEditUser,
  onPreview
}: {
  message: MobileMessage
  onEditUser?: () => void
  onPreview?: (target: { kind: 'file' | 'url'; value: string }) => void
}) {
  const { t } = useI18n()

  if (message.role === 'system') {
    return null
  }

  // User Message
  if (message.role === 'user') {
    return (
      <UserMessageRow
        message={message}
        onEditUser={onEditUser}
        onPreview={onPreview}
      />
    )
  }

  // Assistant Message: Render ordered parts with tool grouping
  const renderedElements: React.ReactNode[] = []
  let currentToolGroup: Extract<MobileMessagePart, { type: 'tool-call' }>[] = []

  const flushToolGroup = () => {
    if (!currentToolGroup.length) return
    const group = [...currentToolGroup]
    renderedElements.push(
      <ToolGroupAccordion key={`tool-group-${renderedElements.length}`} onPreview={onPreview} tools={group} />
    )
    currentToolGroup = []
  }

  message.parts?.forEach((part, index) => {
    if (part.type === 'tool-call') {
      currentToolGroup.push(part)
    } else {
      flushToolGroup()
      if (part.type === 'reasoning') {
        renderedElements.push(
          <ThinkingAccordion key={`reasoning-${index}`} reasoning={part.reasoning} />
        )
      } else if (part.type === 'text') {
        renderedElements.push(
          <div key={`text-${index}`} className="py-1">
            <MarkdownContent
              content={part.text}
              className="text-(--conversation-text-font-size) leading-relaxed text-(--ui-text-primary)"
              onPreview={onPreview}
            />
          </div>
        )
      }
    }
  })
  flushToolGroup()

  const assistantFullText = message.parts?.filter(part => part.type === 'text').map(part => part.text).join('\n') ?? ''

  return (
    <div className="w-full space-y-1.5 group/assistant">
      {message.error ? (
        <div className="flex items-start gap-2.5 text-(--ui-red) p-3 rounded-xl bg-(--ui-bg-card) border border-(--ui-red)/20">
          <Codicon name="error" className="mt-0.5 shrink-0 text-sm" />
          <div className="min-w-0 flex-1 text-xs">
            <p>{message.error}</p>
            {message.retryText && (
              <button
                className="mt-1.5 font-medium text-(--ui-accent) underline underline-offset-2 active:opacity-70"
                onClick={() => void retryMessage(message.id, message.retryText!, message.retryUserMessageId)}
              >
                {t.session.retrySend}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {renderedElements}
          <AssistantActionBar
            text={assistantFullText}
            onRetry={message.retryText ? () => void retryMessage(message.id, message.retryText!, message.retryUserMessageId) : undefined}
          />
        </>
      )}
    </div>
  )
}

function ThinkingAccordion({ reasoning }: { reasoning: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <div className="my-1 text-[length:var(--conversation-tool-font-size)] leading-(--conversation-line-height)">
      <button
        onClick={() => setOpen(!open)}
        className="group/thinking-toggle flex items-center gap-1.5 text-left text-(--conversation-scaffold-text) hover:text-(--ui-text-primary) transition-colors py-0.5 select-none"
      >
        <span className="grid size-3.5 shrink-0 place-items-center">
          <Codicon name="sparkle" size="0.75rem" className="text-(--conversation-scaffold-text) group-hover/thinking-toggle:text-(--ui-text-primary) transition-colors" />
        </span>
        <span className="text-[0.72rem] text-(--conversation-scaffold-text) group-hover/thinking-toggle:text-(--ui-text-primary) transition-colors">
          {t.session.thought}
        </span>
        <Codicon
          name="chevron-down"
          className={cn(
            'text-[0.625rem] text-(--ui-text-quaternary) transition-transform duration-150',
            open ? 'rotate-180 opacity-80' : 'opacity-40 group-hover/thinking-toggle:opacity-80'
          )}
        />
      </button>
      {open && (
        <div className="mt-1 pl-4 py-1.5 border-l-2 border-(--ui-stroke-tertiary) text-[0.72rem] text-(--ui-text-tertiary) whitespace-pre-wrap max-h-60 overflow-y-auto no-scrollbar leading-relaxed font-sans bg-(--ui-bg-card)/30 rounded-r-md">
          {reasoning}
        </div>
      )}
    </div>
  )
}

function CopySnippetButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      title={copied ? '已复制' : '复制'}
      className="p-1 rounded text-(--ui-text-quaternary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors shrink-0"
    >
      <Codicon name={copied ? 'check' : 'copy'} className="text-[0.68rem]" />
    </button>
  )
}

function resolveToolIconName(name: string): string {
  const lower = name.toLowerCase()
  if (lower === 'terminal' || lower.includes('exec') || lower.includes('run') || lower.includes('bash') || lower.includes('sh')) return 'terminal'
  if (lower.includes('search') || lower.includes('grep') || lower.includes('find')) return 'search'
  if (lower.includes('read') || lower.includes('view') || lower.includes('cat')) return 'file'
  if (lower.includes('write') || lower.includes('edit') || lower.includes('patch') || lower.includes('diff')) return 'edit'
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('browse') || lower.includes('http') || lower.includes('url')) return 'globe'
  if (lower.includes('memory') || lower.includes('recall')) return 'brain'
  if (lower.includes('skill')) return 'tools'
  if (lower.includes('watch') || lower.includes('cron')) return 'watch'
  return 'tools'
}

function ToolGroupAccordion({
  onPreview,
  tools
}: {
  onPreview?: (target: { kind: 'file' | 'url'; value: string }) => void
  tools: Extract<MobileMessagePart, { type: 'tool-call' }>[]
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (!tools.length) return null

  const isSingle = tools.length === 1
  const first = tools[0]
  const iconName = resolveToolIconName(first.name)

  const isRunning = tools.some(t => t.status === 'running')
  const isError = tools.some(t => t.status === 'error')

  const titleText = isSingle
    ? formatToolHeader(t, first.name, first.args, first.summary)
    : summarizeMobileToolGroup(t, tools)

  const totalDuration = tools.reduce((acc, t) => (t.durationS ? acc + t.durationS : acc), 0)

  return (
    <div className="my-1 text-[length:var(--conversation-tool-font-size)] leading-(--conversation-line-height)">
      <button
        onClick={() => setOpen(!open)}
        className="group/tool-toggle flex items-center gap-1.5 text-left text-(--conversation-scaffold-text) hover:text-(--ui-text-primary) transition-colors py-0.5 select-none"
      >
        <span className="grid size-3.5 shrink-0 place-items-center">
          {isRunning ? (
            <Codicon name="loading" className="text-xs text-(--ui-accent) animate-spin" />
          ) : isError ? (
            <Codicon name="error" className="text-xs text-(--ui-red)" />
          ) : (
            <ToolIcon name={iconName} size="0.75rem" className="text-(--conversation-scaffold-text) group-hover/tool-toggle:text-(--ui-text-primary) transition-colors" />
          )}
        </span>
        <span className="font-mono text-[0.72rem] text-(--conversation-scaffold-text) group-hover/tool-toggle:text-(--ui-text-primary) transition-colors truncate flex-1">
          {titleText}
        </span>
        {totalDuration > 0 && (
          <span className="shrink-0 text-[0.625rem] tabular-nums text-(--conversation-scaffold-meta)">
            {totalDuration.toFixed(1)}s
          </span>
        )}
        <Codicon
          name="chevron-down"
          className={cn(
            'text-[0.625rem] text-(--ui-text-quaternary) transition-transform duration-150',
            open ? 'rotate-180 opacity-80' : 'opacity-40 group-hover/tool-toggle:opacity-80'
          )}
        />
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-card)/80 backdrop-blur-xs overflow-hidden divide-y divide-(--ui-stroke-quaternary) text-xs">
          {tools.map((tc, i) => {
            const filePath = extractFilePath(tc.args)
            const command = extractCommandText(tc.args)
            const resultStr = tc.result != null ? (typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)) : ''

            return (
              <div key={tc.id || i} className="p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 text-(--ui-text-tertiary)">
                  <span className="font-mono text-[0.7rem] font-semibold text-(--ui-text-secondary) truncate">
                    {formatToolHeader(t, tc.name, tc.args, tc.summary)}
                  </span>
                  {onPreview && filePath && (
                    <button
                      className="ml-1 shrink-0 rounded bg-(--ui-bg-quaternary) px-1.5 py-0.5 text-[0.62rem] font-medium text-(--ui-accent) hover:bg-(--chrome-action-hover) transition-colors"
                      onClick={() => onPreview({ kind: 'file', value: filePath })}
                      type="button"
                    >
                      Preview
                    </button>
                  )}
                  {tc.durationS != null && (
                    <span className="text-[0.625rem] tabular-nums text-(--ui-text-quaternary) ml-auto shrink-0">
                      {tc.durationS.toFixed(1)}s
                    </span>
                  )}
                </div>

                {command && (
                  <div className="flex items-center justify-between gap-2 overflow-x-auto rounded border border-(--ui-stroke-quaternary) bg-(--ui-bg-chrome)/60 px-2 py-1.5 font-mono text-[0.7rem] text-(--ui-text-primary)">
                    <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
                      <span className="text-(--ui-accent) select-none font-bold">$</span>
                      <span className="truncate">{command}</span>
                    </div>
                    <CopySnippetButton text={command} />
                  </div>
                )}

                {resultStr && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)">
                      <span>输出 / 结果</span>
                      <CopySnippetButton text={resultStr} />
                    </div>
                    <pre className="max-h-52 overflow-y-auto overflow-x-auto rounded border border-(--ui-stroke-quaternary)/50 bg-(--ui-bg-chrome)/40 p-2 font-mono text-[0.68rem] leading-relaxed text-(--ui-text-secondary) whitespace-pre-wrap no-scrollbar">
                      {resultStr}
                    </pre>
                  </div>
                )}

                {tc.inlineDiff && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)">
                      <span>变更差异 (Diff)</span>
                      <CopySnippetButton text={tc.inlineDiff} />
                    </div>
                    <pre className="max-h-52 overflow-y-auto overflow-x-auto rounded border border-(--ui-stroke-quaternary)/50 bg-(--ui-bg-chrome)/40 p-2 font-mono text-[0.68rem] leading-relaxed text-(--ui-text-secondary) whitespace-pre-wrap no-scrollbar">
                      {tc.inlineDiff}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function summarizeMobileToolGroup(t: Catalog, tools: Extract<MobileMessagePart, { type: 'tool-call' }>[]): string {
  const isTerminal = tools.every(tool => tool.name === 'terminal' || tool.name === 'execute_code')
  if (isTerminal) {
    return t.session.ranCommands(tools.length)
  }
  const isSearch = tools.every(tool => tool.name.includes('search') || tool.name.includes('read') || tool.name.includes('list'))
  if (isSearch) {
    return t.session.exploredFiles(tools.length)
  }
  return t.session.usedTools(tools.length)
}

function formatToolHeader(t: Catalog, name: string, args: unknown, summary?: string): string {
  if (summary) return summary
  if (typeof args === 'object' && args !== null) {
    const record = args as Record<string, unknown>
    if (record.command) return t.session.ranCommand(String(record.command))
    if (record.query) return t.session.searchedQuery(String(record.query))
    if (record.pattern) return t.session.searchedQuery(String(record.pattern))
    if (record.path) return t.session.readPath(String(record.path))
  }
  return t.session.ranTool(name)
}

function extractCommandText(args: unknown): string | null {
  if (typeof args === 'object' && args !== null) {
    const record = args as Record<string, unknown>
    if (typeof record.command === 'string') return record.command
    if (typeof record.cmd === 'string') return record.cmd
  }
  return null
}

function extractFilePath(args: unknown): string | null {
  if (typeof args === 'object' && args !== null) {
    const record = args as Record<string, unknown>
    if (typeof record.path === 'string') return record.path
    if (typeof record.file_path === 'string') return record.file_path
    if (typeof record.filePath === 'string') return record.filePath
    if (typeof record.target === 'string') return record.target
  }
  return null
}
