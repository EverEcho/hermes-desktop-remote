import { useRef, useState } from 'react'

import { sendMessage } from '@/sessions/store'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/utils'

interface MobileComposerProps {
  busy: boolean
  onStop: () => void
}

export function MobileComposer({ busy, onStop }: MobileComposerProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSend = text.trim().length > 0 && !busy

  const handleSend = () => {
    if (!canSend) {
      return
    }

    void sendMessage(text)
    setText('')

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current

    if (!el) {
      return
    }

    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  return (
    <div
      className="shrink-0 px-3 pt-1.5 bg-(--ui-bg-chrome) border-t border-(--ui-stroke-tertiary)"
      style={{ paddingBottom: 'calc(0.5rem + var(--safe-area-bottom))' }}
    >
      <div className="flex items-end gap-1.5 rounded-[var(--btn-radius)] border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2 py-1">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Message Hermes…"
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent border-none',
            'px-1.5 py-1 text-xs leading-4 text-(--ui-text-primary)',
            'placeholder:text-(--ui-text-quaternary)',
            'focus:outline-none max-h-[120px] no-scrollbar'
          )}
        />

        {busy ? (
          <Button variant="destructive" size="icon-sm" onClick={onStop} aria-label="Stop generation">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </Button>
        ) : (
          <Button variant="default" size="icon-sm" disabled={!canSend} onClick={handleSend} aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </Button>
        )}
      </div>
    </div>
  )
}
