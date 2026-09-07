import { useRef, useState } from 'react'

import { createNewSession, sendMessage } from '@/sessions/store'
import { useI18n } from '@/i18n'
import { cn } from '@/ui/utils'

export function NewSessionHome() {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = async () => {
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    setError(null)
    try {
      const id = await createNewSession()
      if (id) {
        setText('')
        await sendMessage(value)
      } else {
        setError(t.home.startFailed)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-4 pb-16">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--ui-accent) 8%, transparent), transparent 48%)' }} />
      <div className="relative text-center">
        <div className="text-[clamp(2.4rem,8vw,5.5rem)] font-semibold tracking-[-0.08em] text-(--ui-accent)">HERMES AGENT</div>
        <p className="mt-1 text-xs text-(--ui-text-quaternary)">{t.home.tagline}</p>
      </div>
      <div className="relative mt-24 w-full max-w-2xl rounded-md border border-(--ui-stroke-primary) bg-(--ui-bg-card) shadow-(--shadow-nous)">
        <div className="flex items-end gap-2 p-2">
          <textarea
            ref={textareaRef}
            value={text}
            rows={1}
            placeholder={t.home.placeholder}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }}
            className={cn('min-h-7 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-(--ui-text-quaternary)', sending && 'opacity-60')}
          />
          <button disabled={!text.trim() || sending} onClick={() => void submit()} className="rounded-full bg-(--ui-base) p-2 text-(--ui-bg-card) disabled:opacity-30" aria-label={t.home.start}>↑</button>
        </div>
        {error && <p className="px-3 pb-2 text-(--conversation-tool-font-size) text-(--ui-red)">{error}</p>}
      </div>
    </div>
  )
}
