import { useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $connectionState, reconnectGateway } from '@/gateway'
import { $currentModel, $currentProvider, sendMessage } from '@/sessions/store'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'

interface MobileComposerProps {
  busy: boolean
  onStop: () => void
}

const AVAILABLE_MODELS = [
  { id: 'qwen3.8-max-preview', name: 'qwen', provider: 'alibaba' },
  { id: 'qwen3.6-plus', name: 'qwen-plus', provider: 'alibaba' },
  { id: 'qwen3-max', name: 'qwen-max', provider: 'alibaba' },
  { id: 'qwen3-coder', name: 'qwen-coder', provider: 'alibaba' },
  { id: 'claude-3-5-sonnet', name: 'claude-3.5', provider: 'anthropic' },
  { id: 'gpt-4o', name: 'gpt-4o', provider: 'openai' }
]

const REASONING_EFFORTS = ['Low', 'Med', 'High']

export function MobileComposer({ busy, onStop }: MobileComposerProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<{ id: string; name: string; url?: string }[]>([])
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [selectedModel, setSelectedModel] = useState('qwen3.8-max-preview')
  const [selectedProvider, setSelectedProvider] = useState('alibaba')
  const [reasoningEffort, setReasoningEffort] = useState('Med')
  const [isDictating, setIsDictating] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVoiceActive, setIsVoiceActive] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<unknown>(null)

  const currentModelStore = useStore($currentModel)
  const connectionState = useStore($connectionState)
  const connected = connectionState === 'open'

  const activeModel = currentModelStore || selectedModel
  const displayModelName = AVAILABLE_MODELS.find(m => m.id === activeModel)?.name || activeModel.split('-')[0] || 'hermes'

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !busy && connected

  const handleSend = () => {
    if (!canSend) return

    let fullPrompt = text.trim()
    if (attachments.length > 0) {
      const attsText = attachments.map(a => `@file:${a.name}`).join(' ')
      fullPrompt = `${attsText}\n${fullPrompt}`
    }

    void sendMessage(fullPrompt, { model: activeModel, provider: selectedProvider })
    setText('')
    setAttachments([])

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
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !files.length) return
    const newAtts = Array.from(files).map((f, i) => ({
      id: `att-${Date.now()}-${i}`,
      name: f.name,
      url: URL.createObjectURL(f)
    }))
    setAttachments(prev => [...prev, ...newAtts])
    e.target.value = ''
  }

  const toggleDictation = () => {
    if (isDictating) {
      if (recognitionRef.current && typeof (recognitionRef.current as { stop?: () => void }).stop === 'function') {
        (recognitionRef.current as { stop: () => void }).stop()
      }
      setIsDictating(false)
      return
    }

    const win = window as unknown as Record<string, unknown>
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('您的浏览器暂不支持语音识别输入')
      return
    }

    const recognition = new (SpeechRecognition as any)()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'zh-CN'

    recognition.onresult = (event: any) => {
      let resultText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        resultText += event.results[i][0].transcript
      }
      setText(prev => (prev ? `${prev} ${resultText}` : resultText))
    }

    recognition.onend = () => {
      setIsDictating(false)
    }

    recognition.onerror = () => {
      setIsDictating(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsDictating(true)
  }

  return (
    <div
      className="shrink-0 px-3 pt-2 bg-(--ui-bg-chrome) border-t border-(--ui-stroke-tertiary) relative"
      style={{ paddingBottom: 'calc(0.5rem + var(--safe-area-bottom))' }}
    >
      {!connected && (
        <button
          className="mb-2 flex w-full items-center justify-between rounded-lg bg-(--ui-bg-card) px-3 py-1.5 text-xs text-(--ui-text-secondary) active:opacity-70 border border-(--ui-stroke-tertiary)"
          onClick={() => void reconnectGateway()}
        >
          <span>{connectionState === 'auth-required' ? '请重新登录' : '网络断开，尝试重连…'}</span>
          <span className="text-(--ui-accent) font-medium">重连</span>
        </button>
      )}

      {/* Attachments Preview Row */}
      {attachments.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar">
          {attachments.map(att => (
            <div
              key={att.id}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-(--ui-bg-card) border border-(--ui-stroke-tertiary) text-[0.7rem] text-(--ui-text-secondary)"
            >
              <Codicon name="file" className="text-xs text-(--ui-accent)" />
              <span className="truncate max-w-[120px]">{att.name}</span>
              <button
                onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                className="text-(--ui-text-quaternary) hover:text-(--ui-red) ml-0.5"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Single-Row Composer Card */}
      <div className="flex items-center gap-1.5 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) px-2.5 py-1.5 shadow-sm transition-all focus-within:border-(--ui-stroke-primary)">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* 1. Add Attachment (+) Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1 rounded-md text-(--ui-text-tertiary) hover:text-(--ui-text-primary) shrink-0 active:scale-95 transition-transform"
          title="添加附件"
        >
          <Codicon name="add" className="text-base" />
        </button>

        {/* 2. Main Input Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={connected ? '描述你需要什么…' : '等待网关连接…'}
          rows={1}
          className={cn(
            'flex-1 min-w-0 resize-none bg-transparent border-none',
            'px-1 py-1 text-xs leading-relaxed text-(--ui-text-primary)',
            'placeholder:text-(--ui-text-quaternary)',
            'focus:outline-none max-h-[120px] no-scrollbar'
          )}
          disabled={!connected}
        />

        {/* 3. Model Selector Dropdown Pill */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[0.7rem] text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--ui-bg-chrome) transition-colors font-medium whitespace-nowrap"
          >
            <span>{displayModelName} · {reasoningEffort}</span>
            <Codicon name="chevron-down" className="text-[0.6rem] text-(--ui-text-quaternary)" />
          </button>

          {/* Model Picker Modal Popover */}
          {showModelPicker && (
            <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) shadow-lg p-2.5 z-50 text-xs space-y-3">
              <div>
                <p className="text-[0.65rem] font-semibold text-(--ui-text-quaternary) uppercase tracking-wider mb-1.5">
                  模型选择
                </p>
                <div className="space-y-1">
                  {AVAILABLE_MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m.id)
                        setSelectedProvider(m.provider)
                        $currentModel.set(m.id)
                        $currentProvider.set(m.provider)
                        setShowModelPicker(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors',
                        activeModel === m.id
                          ? 'bg-(--ui-accent)/10 text-(--ui-accent) font-medium'
                          : 'text-(--ui-text-secondary) hover:bg-(--ui-bg-chrome)'
                      )}
                    >
                      <span>{m.name}</span>
                      {activeModel === m.id && <Codicon name="check" className="text-xs" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-(--ui-stroke-quaternary) pt-2">
                <p className="text-[0.65rem] font-semibold text-(--ui-text-quaternary) uppercase tracking-wider mb-1.5">
                  思考深度 (Reasoning Effort)
                </p>
                <div className="flex gap-1 bg-(--ui-bg-chrome) p-1 rounded-lg">
                  {REASONING_EFFORTS.map(effort => (
                    <button
                      key={effort}
                      onClick={() => setReasoningEffort(effort)}
                      className={cn(
                        'flex-1 py-1 text-center rounded-md text-[0.7rem] transition-colors',
                        reasoningEffort === effort
                          ? 'bg-(--ui-bg-card) text-(--ui-text-primary) font-medium shadow-xs'
                          : 'text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)'
                      )}
                    >
                      {effort}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Dictation Button */}
        <button
          type="button"
          onClick={toggleDictation}
          className={cn(
            'p-1 rounded-md shrink-0 transition-colors',
            isDictating
              ? 'text-(--ui-red) bg-(--ui-red)/10 animate-pulse'
              : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary)'
          )}
          title="语音输入"
        >
          <Codicon name="mic" className="text-sm" />
        </button>

        {/* 5. Mute Button */}
        <button
          type="button"
          onClick={() => setIsMuted(!isMuted)}
          className={cn(
            'p-1 rounded-md shrink-0 transition-colors',
            isMuted
              ? 'text-(--ui-text-quaternary)'
              : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary)'
          )}
          title={isMuted ? '取消静音' : '静音'}
        >
          <Codicon name={isMuted ? 'mute' : 'unmute'} className="text-sm" />
        </button>

        {/* 6. Voice Waveform Button */}
        <button
          type="button"
          onClick={() => setIsVoiceActive(!isVoiceActive)}
          className={cn(
            'p-1 rounded-md shrink-0 transition-colors',
            isVoiceActive
              ? 'text-(--ui-accent)'
              : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary)'
          )}
          title="语音模式"
        >
          <Codicon name="pulse" className="text-sm" />
        </button>

        {/* 7. Circular Primary Button (Send / Stop) */}
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="size-7 rounded-full bg-(--ui-text-primary) text-(--ui-bg-card) grid place-items-center shrink-0 hover:opacity-90 active:scale-95 transition-all"
            title="停止生成"
          >
            <span className="size-2.5 rounded-xs bg-current" />
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSend}
            className={cn(
              'size-7 rounded-full grid place-items-center shrink-0 transition-all',
              canSend
                ? 'bg-(--ui-text-primary) text-(--ui-bg-card) hover:opacity-90 active:scale-95 shadow-xs'
                : 'bg-(--ui-text-quaternary)/30 text-(--ui-text-quaternary) cursor-not-allowed'
            )}
            title="发送消息"
          >
            <Codicon name="arrow-up" className="text-sm font-bold" />
          </button>
        )}
      </div>
    </div>
  )
}
