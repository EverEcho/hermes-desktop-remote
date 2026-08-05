import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import {
  $messages,
  $busy,
  $awaitingResponse,
  editAndResend,
  retryMessage,
  stopGeneration
} from './store'
import type { MobileMessage, MobileMessagePart } from '@/types/mobile'
import { MobileComposer } from '@/components/MobileComposer'
import { cn } from '@/ui/utils'
import { MarkdownContent } from '@/components/MarkdownContent'
import { Codicon } from '@/ui/Codicon'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { Button } from '@/ui/Button'
import { useI18n, type Catalog } from '@/i18n'

interface SessionDetailProps {
  sessionId: string
}

export function SessionDetail({ sessionId: _sessionId }: SessionDetailProps) {
  const { t } = useI18n()
  const messages = useStore($messages)
  const busy = useStore($busy)
  const awaitingResponse = useStore($awaitingResponse)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [editingMessage, setEditingMessage] = useState<MobileMessage | null>(null)

  useEffect(() => {
    if (!userScrolledUp.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
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
        className="flex-1 overflow-y-auto no-scrollbar px-3 md:px-6 py-4 space-y-4 max-w-4xl mx-auto w-full"
        onScroll={handleScroll}
      >
        {messages.length === 0 && !busy && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <Codicon name="robot" className="text-3xl text-(--ui-text-quaternary) mb-2" />
            <p className="text-xs text-(--ui-text-tertiary)">{t.session.emptyHint}</p>
          </div>
        )}

        {messages.map(msg => (
          <MessageRow
            key={msg.id}
            message={msg}
            onEditUser={msg.role === 'user' ? () => setEditingMessage(msg) : undefined}
          />
        ))}

        {awaitingResponse && (
          <div className="flex items-center gap-2 py-2 px-1 text-(--ui-text-tertiary)">
            <Codicon name="sparkle" className="text-xs text-(--ui-accent) animate-spin" />
            <span className="text-xs text-(--ui-text-secondary)">{t.session.thinking}</span>
          </div>
        )}

        <div className="h-4" />
      </div>

      {userScrolledUp.current && (
        <button
          className="absolute bottom-20 right-4 size-8 rounded-full border border-(--ui-stroke-tertiary) shadow-(--shadow-nous) bg-(--ui-bg-elevated) grid place-items-center text-(--ui-text-secondary) z-10 active:scale-95 transition-transform"
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
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

function MessageRow({ message, onEditUser }: { message: MobileMessage; onEditUser?: () => void }) {
  const { t } = useI18n()

  if (message.role === 'system') {
    return null
  }

  // User Message
  if (message.role === 'user') {
    const textPart = message.parts?.find(p => p.type === 'text')?.text || ''
    const isContextCompaction = textPart.startsWith('[CONTEXT COMPACTION') || textPart.startsWith('[SYSTEM]')

    if (isContextCompaction) {
      return (
        <div className="my-3 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) p-3 text-xs text-(--ui-text-tertiary) leading-relaxed">
          {textPart}
        </div>
      )
    }

    return (
      <div className="sticky top-0 z-10 bg-(--ui-bg-chrome) py-1.5 w-full">
        <div
          className={cn(
            'relative w-full rounded-xl border bg-(--ui-bg-card) p-3 text-left shadow-xs transition-colors',
            message.failed ? 'border-(--ui-red)' : 'border-(--ui-stroke-tertiary)'
          )}
        >
          <MarkdownContent
            content={textPart}
            className="text-(--conversation-text-font-size) leading-[var(--conversation-line-height)] text-(--ui-text-primary)"
          />
          {onEditUser && (
            <button
              type="button"
              onClick={onEditUser}
              title={t.session.editMessage}
              className="absolute top-1.5 right-1.5 p-1 rounded-md text-(--ui-text-quaternary) hover:text-(--ui-text-primary) active:scale-95 transition-all"
            >
              <Codicon name="edit" className="text-xs" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // Assistant Message: Render ordered parts with tool grouping
  const renderedElements: React.ReactNode[] = []
  let currentToolGroup: Extract<MobileMessagePart, { type: 'tool-call' }>[] = []

  const flushToolGroup = () => {
    if (!currentToolGroup.length) return
    const group = [...currentToolGroup]
    renderedElements.push(
      <ToolGroupAccordion key={`tool-group-${renderedElements.length}`} tools={group} />
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
            />
          </div>
        )
      }
    }
  })
  flushToolGroup()

  return (
    <div className="w-full my-3 space-y-2">
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
        renderedElements
      )}
    </div>
  )
}

function ThinkingAccordion({ reasoning }: { reasoning: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <div className="my-1.5 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-(--ui-text-tertiary) hover:text-(--ui-text-secondary) transition-colors py-0.5"
      >
        <span className="font-normal">{t.session.thought}</span>
        <Codicon
          name="chevron-down"
          className={cn('text-[0.65rem] text-(--ui-text-quaternary) transition-transform duration-150', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="mt-1 text-[0.72rem] text-(--ui-text-tertiary) whitespace-pre-wrap max-h-56 overflow-y-auto no-scrollbar leading-relaxed font-sans">
          {reasoning}
        </div>
      )}
    </div>
  )
}

function ToolGroupAccordion({ tools }: { tools: Extract<MobileMessagePart, { type: 'tool-call' }>[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (!tools.length) return null

  const isSingle = tools.length === 1
  const first = tools[0]
  const isSearch = first.name.toLowerCase().includes('search') || first.name.toLowerCase().includes('grep') || first.name.toLowerCase().includes('find')
  const icon = isSearch ? 'search' : first.name.includes('run') || first.name.includes('exec') || first.name === 'terminal' ? 'terminal' : 'tools'

  const titleText = isSingle
    ? formatToolHeader(t, first.name, first.args, first.summary)
    : summarizeMobileToolGroup(t, tools)

  return (
    <div className="my-1.5 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-left text-(--ui-text-tertiary) hover:text-(--ui-text-secondary) transition-colors py-0.5"
      >
        <Codicon
          name={icon}
          className={cn(
            'text-xs shrink-0',
            tools.some(t => t.status === 'running')
              ? 'text-(--ui-accent) animate-spin'
              : tools.some(t => t.status === 'error')
              ? 'text-(--ui-red)'
              : 'text-(--ui-text-quaternary)'
          )}
        />
        <span className="font-mono text-[0.72rem] text-(--ui-text-tertiary) truncate flex-1">
          {titleText}
        </span>
        <Codicon
          name="chevron-down"
          className={cn('text-xs text-(--ui-text-quaternary) ml-0.5 transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-1.5 p-2.5 text-[0.72rem] font-mono rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) space-y-2 text-(--ui-text-secondary)">
          {tools.map((tc, i) => (
            <div key={tc.id || i} className={cn(i > 0 && 'border-t border-(--ui-stroke-quaternary) pt-2')}>
              <div className="flex items-center gap-1.5 text-(--ui-text-tertiary) mb-1 font-sans">
                <span className="font-mono text-[0.7rem] font-semibold text-(--ui-text-secondary)">
                  {formatToolHeader(t, tc.name, tc.args, tc.summary)}
                </span>
                {tc.durationS != null && (
                  <span className="text-[0.625rem] text-(--ui-text-quaternary) ml-auto">
                    {tc.durationS.toFixed(1)}s
                  </span>
                )}
              </div>
              {extractCommandText(tc.args) && (
                <div className="overflow-x-auto bg-(--ui-bg-chrome)/50 p-1.5 rounded border border-(--ui-stroke-quaternary) mb-1">
                  <span className="text-(--ui-accent) select-none">$ </span>
                  {extractCommandText(tc.args)}
                </div>
              )}
              {Boolean(tc.result) && (
                <pre className="overflow-x-auto whitespace-pre-wrap max-h-44 overflow-y-auto no-scrollbar text-(--ui-text-secondary)">
                  {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}
                </pre>
              )}
              {tc.inlineDiff && (
                <pre className="overflow-x-auto whitespace-pre-wrap max-h-44 overflow-y-auto no-scrollbar text-(--ui-text-secondary)">
                  {tc.inlineDiff}
                </pre>
              )}
            </div>
          ))}
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
