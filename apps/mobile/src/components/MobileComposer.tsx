import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $connectionState, reconnectGateway } from '@/gateway'
import * as api from '@/gateway/api'
import {
  $activeRuntimeId,
  $currentFast,
  $currentModel,
  $currentProvider,
  $currentReasoningEffort,
  sendMessage
} from '@/sessions/store'
import type { ModelOptionProvider } from '@/types/hermes'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface MobileComposerProps {
  busy: boolean
  onStop: () => void
}

interface Attachment {
  id: string
  name: string
  dataUrl: string
}

/* Same scale as Desktop (lib/reasoning-effort.ts): values are gateway enums,
 * labels are Desktop's short labels. `none` = thinking off. */
const REASONING_EFFORTS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' }
]

/* Port of Desktop's resolveFastControl (app/shell/model-edit-submenu.tsx):
 * fast is either the `speed=fast` request param or a `…-fast` sibling model. */
type FastControl =
  | { kind: 'none' }
  | { kind: 'param'; on: boolean }
  | { kind: 'variant'; baseId: string; fastId: string; on: boolean }

function resolveFastControl(
  model: string,
  providerModels: readonly string[],
  paramSupported: boolean,
  currentFastMode: boolean
): FastControl {
  if (paramSupported) {
    return { kind: 'param', on: currentFastMode }
  }

  if (/-fast$/i.test(model)) {
    const baseId = model.replace(/-fast$/i, '')
    return providerModels.includes(baseId)
      ? { kind: 'variant', baseId, fastId: model, on: true }
      : { kind: 'none' }
  }

  const fastId = `${model}-fast`

  if (providerModels.includes(fastId)) {
    return { kind: 'variant', baseId: model, fastId, on: false }
  }

  if (currentFastMode) {
    return { kind: 'param', on: true }
  }

  return { kind: 'none' }
}

function prettifyModel(id: string): string {
  const word = id.split(/[-_.]/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  return word || id
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

export function MobileComposer({ busy, onStop }: MobileComposerProps) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [providers, setProviders] = useState<ModelOptionProvider[]>([])
  /* Desktop rotates composer placeholders; pick one per mount. */
  const [placeholder] = useState(
    () => t.composer.followUpPlaceholders[Math.floor(Math.random() * t.composer.followUpPlaceholders.length)]
  )
  const [isDictating, setIsDictating] = useState(false)
  const [dictationHint, setDictationHint] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const currentModelStore = useStore($currentModel)
  const currentProviderStore = useStore($currentProvider)
  const reasoningEffort = useStore($currentReasoningEffort)
  const currentFast = useStore($currentFast)
  const connectionState = useStore($connectionState)
  const connected = connectionState === 'open'

  /* Model catalog comes from the gateway, like Desktop's model.options RPC. */
  useEffect(() => {
    if (!connected) return
    let cancelled = false

    api.getModelInfo().then(info => {
      if (cancelled || !info.model) return
      $currentModel.set(info.model)
      if (info.provider) $currentProvider.set(info.provider)
    }).catch(() => { /* keep current */ })

    api.getModelOptions().then(options => {
      if (cancelled) return
      setProviders(options.providers ?? [])
      if (options.model && !$currentModel.get()) {
        $currentModel.set(options.model)
        if (options.provider) $currentProvider.set(options.provider)
      }
    }).catch(() => { /* catalog unavailable */ })

    return () => { cancelled = true }
  }, [connected])

  const activeModel = currentModelStore
  const activeProvider = currentProviderStore

  /* The catalog carries MoA presets as a virtual `moa` provider row — render
   * them in a dedicated section, keep them out of the provider groups. */
  const moaPresets = providers.find(provider => provider.slug.toLowerCase() === 'moa')?.models ?? []
  const modelProviders = providers.filter(provider => provider.slug.toLowerCase() !== 'moa')

  const activeProviderInfo = providers.find(provider => provider.slug === activeProvider)
  const capabilities = activeModel ? activeProviderInfo?.capabilities?.[activeModel] : undefined
  const reasoningSupported = capabilities?.reasoning ?? true

  const fastControl = resolveFastControl(
    activeModel,
    activeProviderInfo?.models ?? [],
    capabilities?.fast ?? false,
    currentFast
  )
  const fastOn = fastControl.kind !== 'none' && fastControl.on

  const effortLabel = REASONING_EFFORTS.find(effort => effort.value === reasoningEffort)?.label ?? 'Med'
  const pillMeta = [fastOn ? t.composer.fast : null, reasoningSupported ? effortLabel : null].filter(Boolean).join(' ')
  const displayModelName = activeModel ? prettifyModel(activeModel) : t.composer.defaultModel

  /* Gateway prompt.submit requires text; attachments are supplemental. */
  const canSend = text.trim().length > 0 && !busy && connected

  const handleSend = () => {
    if (!canSend) return

    void sendMessage(text.trim(), {
      model: activeModel || undefined,
      provider: activeProvider || undefined,
      reasoningEffort: reasoningSupported ? reasoningEffort : undefined,
      attachments: attachments.map(att => ({ data_url: att.dataUrl, filename: att.name }))
    })
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !files.length) return

    const selected = Array.from(files)
    e.target.value = ''

    const loaded = await Promise.all(
      selected.map(async (file, i) => ({
        id: `att-${Date.now()}-${i}`,
        name: file.name,
        dataUrl: await readFileAsDataUrl(file)
      }))
    )
    setAttachments(prev => [...prev, ...loaded])
  }

  const toggleFast = () => {
    if (fastControl.kind === 'variant') {
      $currentModel.set(fastControl.on ? fastControl.baseId : fastControl.fastId)
      return
    }

    if (fastControl.kind === 'param') {
      const next = !fastControl.on
      $currentFast.set(next)
      const runtimeId = $activeRuntimeId.get()
      if (runtimeId) {
        void api.setSessionFast(runtimeId, next).catch(() => { /* best effort */ })
      }
    }
  }

  const toggleDictation = () => {
    if (isDictating) {
      recognitionRef.current?.stop()
      setIsDictating(false)
      return
    }

    const win = window as unknown as Record<string, unknown>
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setDictationHint(t.composer.dictationUnsupported)
      window.setTimeout(() => setDictationHint(null), 2600)
      return
    }

    const recognition = new (SpeechRecognition as new () => SpeechRecognitionLike)()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'zh-CN'

    recognition.onresult = event => {
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

  const selectModel = (provider: ModelOptionProvider, model: string) => {
    $currentModel.set(model)
    $currentProvider.set(provider.slug)
    setShowModelPicker(false)
  }

  const selectMoaPreset = (preset: string) => {
    $currentModel.set(preset)
    $currentProvider.set('moa')
    setShowModelPicker(false)
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
          <span>{connectionState === 'auth-required' ? t.composer.reauthRequired : t.composer.disconnected}</span>
          <span className="text-(--ui-accent) font-medium">{t.composer.reconnect}</span>
        </button>
      )}

      {dictationHint && (
        <div className="mb-2 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) px-3 py-1.5 text-xs text-(--ui-text-secondary)">
          {dictationHint}
        </div>
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
                <Codicon name="close" className="text-[0.65rem]" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Single-Row Composer Card — Desktop input chrome */}
      <div className="desktop-input-chrome flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => void handleFileSelect(e)}
        />

        {/* 1. Add Attachment (+) Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1 rounded-md text-(--ui-text-tertiary) hover:text-(--ui-text-primary) shrink-0 active:scale-95 transition-transform"
          title={t.composer.addAttachment}
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
          placeholder={connected ? placeholder : t.composer.placeholderConnecting}
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
            <span className="max-w-[8.5rem] truncate">
              {displayModelName}{pillMeta ? ` · ${pillMeta}` : ''}
            </span>
            <Codicon name="chevron-down" className="text-[0.6rem] text-(--ui-text-quaternary)" />
          </button>

          {/* Model Picker Modal Popover */}
          {showModelPicker && (
            <div className="absolute bottom-full right-0 mb-2 w-72 max-h-[60vh] overflow-y-auto no-scrollbar rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) shadow-(--shadow-nous) p-2.5 z-50 text-xs space-y-3">
              <div>
                <p className="text-[0.65rem] font-semibold text-(--ui-text-quaternary) uppercase tracking-wider mb-1.5">
                  {t.composer.modelSection}
                </p>
                {modelProviders.length === 0 && (
                  <p className="px-2.5 py-1.5 text-(--ui-text-tertiary)">
                    {connected ? t.composer.noModels : t.composer.gatewayClosed}
                  </p>
                )}
                <div className="space-y-2.5">
                  {modelProviders.map(provider => {
                    const models = provider.models?.length ? provider.models : provider.featured_models ?? []
                    if (!models.length) return null
                    return (
                      <div key={provider.slug}>
                        <p className="px-2.5 pb-1 text-[0.625rem] font-mono text-(--ui-text-quaternary) truncate">
                          {provider.name}
                        </p>
                        <div className="space-y-0.5">
                          {models.map(model => (
                            <button
                              key={`${provider.slug}/${model}`}
                              onClick={() => selectModel(provider, model)}
                              className={cn(
                                'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left font-mono text-[0.7rem] transition-colors',
                                activeModel === model && activeProvider === provider.slug
                                  ? 'bg-(--ui-row-active-background) text-(--ui-accent) font-medium'
                                  : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
                              )}
                            >
                              <span className="truncate">{model}</span>
                              {activeModel === model && activeProvider === provider.slug && (
                                <Codicon name="check" className="text-xs shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {moaPresets.length > 0 && (
                <div className="border-t border-(--ui-stroke-quaternary) pt-2">
                  <p className="text-[0.65rem] font-semibold text-(--ui-text-quaternary) uppercase tracking-wider mb-1.5">
                    {t.composer.moaPresets}
                  </p>
                  <div className="space-y-0.5">
                    {moaPresets.map(preset => (
                      <button
                        key={`moa:${preset}`}
                        onClick={() => selectMoaPreset(preset)}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left font-mono text-[0.7rem] transition-colors',
                          activeProvider === 'moa' && activeModel === preset
                            ? 'bg-(--ui-row-active-background) text-(--ui-accent) font-medium'
                            : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
                        )}
                      >
                        <span className="truncate">MoA: {preset}</span>
                        {activeProvider === 'moa' && activeModel === preset && (
                          <Codicon name="check" className="text-xs shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {fastControl.kind !== 'none' && (
                <div className="flex items-center justify-between border-t border-(--ui-stroke-quaternary) pt-2">
                  <span className="text-[0.65rem] font-semibold text-(--ui-text-quaternary) uppercase tracking-wider">
                    {t.composer.fast}
                  </span>
                  <button
                    type="button"
                    onClick={toggleFast}
                    className={cn(
                      'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                      fastOn ? 'bg-(--theme-primary)' : 'bg-(--ui-bg-quaternary)'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
                        fastOn ? 'translate-x-[18px]' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </div>
              )}

              {reasoningSupported && (
                <div className="border-t border-(--ui-stroke-quaternary) pt-2">
                  <p className="text-[0.65rem] font-semibold text-(--ui-text-quaternary) uppercase tracking-wider mb-1.5">
                    {t.composer.reasoningSection}
                  </p>
                  <div className="flex gap-1 bg-(--ui-bg-chrome) p-1 rounded-lg">
                    {REASONING_EFFORTS.map(effort => (
                      <button
                        key={effort.value}
                        onClick={() => $currentReasoningEffort.set(effort.value)}
                        className={cn(
                          'flex-1 py-1 text-center rounded-md text-[0.7rem] transition-colors',
                          reasoningEffort === effort.value
                            ? 'bg-(--ui-bg-card) text-(--ui-text-primary) font-medium shadow-xs'
                            : 'text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)'
                        )}
                      >
                        {effort.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
          title={t.composer.dictation}
        >
          <Codicon name="mic" className="text-sm" />
        </button>

        {/* 5. Circular Primary Button (Send / Stop) — matches Desktop */}
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="size-7 rounded-full bg-(--ui-text-primary) text-(--ui-bg-card) grid place-items-center shrink-0 hover:opacity-90 active:scale-95 transition-all"
            title={t.composer.stop}
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
            title={t.composer.send}
          >
            <Codicon name="arrow-up" className="text-sm font-bold" />
          </button>
        )}
      </div>
    </div>
  )
}
