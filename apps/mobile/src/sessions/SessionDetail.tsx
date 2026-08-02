import { useEffect, useRef } from 'react'
import { useStore } from '@nanostores/react'

import {
  $messages,
  $busy,
  $awaitingResponse,
  $sessionTitle,
  $currentModel,
  $currentProvider,
  stopGeneration
} from './store'
import type { MobileMessage } from '@/types/mobile'
import { MobileComposer } from '@/components/MobileComposer'
import { cn } from '@/ui/utils'

interface SessionDetailProps {
  sessionId: string
}

export function SessionDetail({ sessionId }: SessionDetailProps) {
  const messages = useStore($messages)
  const busy = useStore($busy)
  const awaitingResponse = useStore($awaitingResponse)
  const title = useStore($sessionTitle)
  const model = useStore($currentModel)
  const provider = useStore($currentProvider)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)

  useEffect(() => {
    if (!userScrolledUp.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleScroll = () => {
    const el = scrollRef.current

    if (!el) {
      return
    }

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    userScrolledUp.current = !atBottom
  }

  const scrollToBottom = () => {
    userScrolledUp.current = false
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="h-full flex flex-col relative bg-(--ui-bg-chrome)">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto no-scrollbar px-4 py-3"
        onScroll={handleScroll}
      >
        {messages.length === 0 && !busy && (
          <div className="flex items-center justify-center h-full">
            <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary)">
              Start a conversation
            </p>
          </div>
        )}

        {messages.map(msg => (
          <MessageRow key={msg.id} message={msg} />
        ))}

        {awaitingResponse && (
          <div className="flex items-center gap-2 py-2 text-(--conversation-scaffold-meta)">
            <span className="size-1.5 rounded-full bg-(--ui-accent) animate-pulse" />
            <span className="text-(--conversation-tool-font-size)">Thinking…</span>
          </div>
        )}

        <div className="h-2" />
      </div>

      {userScrolledUp.current && (
        <button
          className="absolute bottom-24 right-4 size-9 rounded-full border border-(--stroke-nous) shadow-(--shadow-nous) bg-[color-mix(in_srgb,var(--ui-bg-card)_88%,transparent)] backdrop-blur-md grid place-items-center text-(--ui-text-secondary) z-10"
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      <MobileComposer busy={busy} onStop={() => void stopGeneration()} />
    </div>
  )
}

function MessageRow({ message }: { message: MobileMessage }) {
  if (message.role === 'system') {
    return null
  }

  if (message.role === 'tool') {
    return (
      <div className="flex items-center gap-2 py-1 text-(--conversation-scaffold-meta)">
        <span className="size-1 rounded-full bg-(--ui-text-quaternary)" />
        <span className="text-(--conversation-tool-font-size) font-mono truncate">
          {message.content || 'tool result'}
        </span>
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] rounded-3xl bg-(--ui-chat-bubble-background) px-3.5 py-2.5">
          <div className="text-(--conversation-text-font-size) leading-[var(--conversation-line-height)] whitespace-pre-wrap break-words text-(--ui-text-primary)">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-3">
      {message.error ? (
        <div className="flex items-start gap-2 text-(--ui-red)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-(--conversation-text-font-size)">{message.error}</p>
        </div>
      ) : (
        <div className="text-(--conversation-text-font-size) leading-[var(--conversation-line-height)] whitespace-pre-wrap break-words text-(--ui-text-primary)">
          {message.content}
        </div>
      )}

      {message.reasoning && (
        <details className="mt-1.5">
          <summary className="text-(--conversation-tool-font-size) text-(--conversation-scaffold-meta) cursor-pointer select-none">
            Thinking
          </summary>
          <p className="mt-1 text-(--conversation-tool-font-size) text-(--conversation-scaffold-meta) whitespace-pre-wrap max-h-40 overflow-y-auto no-scrollbar border-l border-(--ui-stroke-tertiary) pl-2.5">
            {message.reasoning}
          </p>
        </details>
      )}

      {message.toolCalls?.map(tc => (
        <ToolCallRow key={tc.id} tc={tc} />
      ))}
    </div>
  )
}

function ToolCallRow({ tc }: { tc: NonNullable<MobileMessage['toolCalls']>[number] }) {
  return (
    <details className="mt-1.5 rounded-lg bg-(--ui-widget-surface-background) px-3 py-2">
      <summary className="flex items-center gap-2 cursor-pointer select-none">
        <span
          className={cn(
            'size-1.5 rounded-full shrink-0',
            tc.status === 'running'
              ? 'bg-(--ui-accent) animate-pulse'
              : tc.status === 'error'
                ? 'bg-(--ui-red)'
                : 'bg-(--ui-green)'
          )}
        />
        <span className="font-mono text-(--conversation-tool-font-size) text-(--conversation-scaffold-text)">
          {tc.name}
        </span>
        {tc.durationS != null && (
          <span className="text-(--conversation-tool-font-size) text-(--conversation-scaffold-meta)">
            {tc.durationS.toFixed(1)}s
          </span>
        )}
      </summary>
      {tc.summary && (
        <p className="mt-1.5 text-(--conversation-tool-font-size) text-(--conversation-scaffold-meta)">
          {tc.summary}
        </p>
      )}
      {tc.inlineDiff && (
        <pre className="mt-1.5 text-(--conversation-tool-font-size) font-mono overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto no-scrollbar text-(--conversation-scaffold-text)">
          {tc.inlineDiff}
        </pre>
      )}
    </details>
  )
}
