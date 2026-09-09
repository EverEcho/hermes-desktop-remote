import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import { $connectionState, reconnectGateway } from '@/gateway'
import * as api from '@/gateway/api'
import {
  $activeRuntimeId,
  $activeSessionId,
  $currentCwd,
  $currentFast,
  $currentModel,
  $currentProvider,
  $currentReasoningEffort,
  $queuedPrompts,
  drainQueuedPromptsNow,
  enqueuePrompt,
  redirectMessage,
  removeQueuedPrompt,
  sendMessage,
  sendSlashCommand
} from '@/sessions/store'
import { getDraft, setDraft } from '@/sessions/drafts'
import type { ModelOptionProvider } from '@/types/hermes'
import { Codicon } from '@/ui/Codicon'
import { Switch } from '@/ui/Switch'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'
import { useAppSurface } from '@/bootstrap/surface-context'

interface MobileComposerProps {
  busy: boolean
  onStop: () => void
}

interface Attachment {
  id: string
  name: string
  dataUrl: string
  size?: number
}

const REFERENCE_PRESETS: api.PathCompletionItem[] = [
  { text: '@file:', display: '@file (Remote file)', meta: 'reference' },
  { text: '@folder:', display: '@folder (Remote directory)', meta: 'reference' },
  { text: '@url:', display: '@url (Web URL)', meta: 'reference' },
  { text: '@git:', display: '@git (Git review/branch)', meta: 'reference' },
  { text: '@tool:', display: '@tool (Skill or toolset)', meta: 'reference' }
]

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

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
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
  const surface = useAppSurface()
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
  const [audioMuted, setAudioMuted] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('hermes_audio_muted') === 'true'
    } catch {
      return false
    }
  })
  const [voiceModeActive, setVoiceModeActive] = useState(false)
  const [slashItems, setSlashItems] = useState<api.SlashCompletionItem[]>([])
  const [pathItems, setPathItems] = useState<api.PathCompletionItem[]>([])
  const [completionIndex, setCompletionIndex] = useState(0)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)

  const currentModelStore = useStore($currentModel)
  const currentProviderStore = useStore($currentProvider)
  const reasoningEffort = useStore($currentReasoningEffort)
  const currentFast = useStore($currentFast)
  const connectionState = useStore($connectionState)
  const activeSessionId = useStore($activeSessionId)
  const currentCwd = useStore($currentCwd)
  const queuedPrompts = useStore($queuedPrompts)[activeSessionId ?? ''] ?? []
  const connected = connectionState === 'open'

  /* Per-session draft restore (Desktop use-composer-draft.ts parity). */
  useEffect(() => {
    setText(activeSessionId ? getDraft(activeSessionId) : '')
    setAttachments([])

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    if (surface === 'desktop') {
      window.setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [activeSessionId, surface])

  useEffect(() => {
    if (!activeSessionId) return

    const timer = window.setTimeout(() => setDraft(activeSessionId, text), 300)

    return () => window.clearTimeout(timer)
  }, [text, activeSessionId])

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

  /* Slash completions — Desktop's complete.slash RPC, debounced. Only while
   * typing the leading command token (no space yet). */
  useEffect(() => {
    const trimmed = text.trimStart()
    const isSlashQuery = connected && !busy && trimmed.startsWith('/') && !trimmed.includes(' ') && trimmed.length <= 64

    if (!isSlashQuery) {
      setSlashItems([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      api.completeSlash(trimmed)
        .then(result => {
          if (!cancelled) {
            setSlashItems(result.items ?? [])
            setCompletionIndex(0)
          }
        })
        .catch(() => { if (!cancelled) setSlashItems([]) })
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [text, connected, busy])

  /* `@` references use the Gateway's path index. This works identically in
   * browser, mobile and desktop because we never read a client-local path. */
  useEffect(() => {
    const match = text.match(/(?:^|\s)@([^\s]*)$/)
    const query = match?.[1]

    if (!connected || query === undefined || query.length > 240) {
      setPathItems([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      const lowerQuery = query.toLowerCase()
      const matchingPresets = REFERENCE_PRESETS.filter(preset =>
        !lowerQuery || preset.text.toLowerCase().includes(lowerQuery) || preset.display?.toLowerCase().includes(lowerQuery)
      )

      api.completePath(`@${query}`, { cwd: currentCwd || undefined, sessionId: activeSessionId ?? undefined })
        .then(result => {
          if (!cancelled) {
            const remoteItems = result.items ?? []
            setPathItems([...matchingPresets, ...remoteItems])
            setCompletionIndex(0)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPathItems(matchingPresets)
            setCompletionIndex(0)
          }
        })
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [text, connected, activeSessionId, currentCwd])

  const activeModel = currentModelStore
  const activeProvider = currentProviderStore

  /* The catalog carries MoA presets as a virtual `moa` provider row — render
   * them in a dedicated section, keep them out of the provider groups. */
  const moaPresets = providers.find(provider => provider.slug.toLowerCase() === 'moa')?.models ?? []
  const modelProviders = providers.filter(provider => provider.slug.toLowerCase() !== 'moa')

  const activeProviderInfo = providers.find(provider => provider.slug === activeProvider)
  const capabilities = activeModel ? activeProviderInfo?.capabilities?.[activeModel] : undefined
  const reasoningSupported = capabilities?.reasoning ?? true
  const reasoningCanDisable = capabilities?.can_disable_reasoning !== false
  const reasoningOptions = reasoningCanDisable
    ? REASONING_EFFORTS
    : REASONING_EFFORTS.filter(effort => effort.value !== 'none')

  useEffect(() => {
    if (reasoningSupported && !reasoningCanDisable && reasoningEffort === 'none') {
      $currentReasoningEffort.set('medium')
    }
  }, [reasoningCanDisable, reasoningEffort, reasoningSupported])

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
  const canSteer = text.trim().length > 0 && busy && connected && attachments.length === 0
  const canQueue = text.trim().length > 0 && busy && connected

  const handleSend = () => {
    if (!canSend && !canSteer) return

    const trimmed = text.trim()

    if (canSteer) {
      void redirectMessage(trimmed).then(accepted => {
        if (accepted) {
          setText('')
          if (textareaRef.current) textareaRef.current.style.height = 'auto'
        }
      })
      return
    }

    if (activeSessionId) {
      setDraft(activeSessionId, '')
    }

    if (trimmed.startsWith('/')) {
      setSlashItems([])
      void sendSlashCommand(trimmed)
      setText('')

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }

      return
    }

    void sendMessage(trimmed, {
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

  const handleQueue = () => {
    if (!canQueue) return
    const accepted = enqueuePrompt(text.trim(), {
      attachments: attachments.map(att => ({ data_url: att.dataUrl, filename: att.name })),
      model: activeModel || undefined,
      provider: activeProvider || undefined,
      reasoningEffort: reasoningSupported ? reasoningEffort : undefined
    })
    if (!accepted) return
    setText('')
    setAttachments([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return

    const isSlashOpen = slashItems.length > 0
    const isPathOpen = pathItems.length > 0

    if (isSlashOpen || isPathOpen) {
      const currentListLength = isSlashOpen ? slashItems.length : pathItems.length

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCompletionIndex(prev => (prev + 1) % currentListLength)
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCompletionIndex(prev => (prev - 1 + currentListLength) % currentListLength)
        return
      }

      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault()
        if (isSlashOpen && slashItems[completionIndex]) {
          const item = slashItems[completionIndex]
          setText(item.text.includes(' ') ? item.text : `${item.text} `)
          setSlashItems([])
          setCompletionIndex(0)
        } else if (isPathOpen && pathItems[completionIndex]) {
          choosePathReference(pathItems[completionIndex])
          setCompletionIndex(0)
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashItems([])
        setPathItems([])
        setCompletionIndex(0)
        return
      }
    }

    const shouldSubmit = surface === 'desktop'
      ? e.key === 'Enter' && !e.shiftKey
      : e.key === 'Enter' && (e.metaKey || e.ctrlKey)

    if (shouldSubmit) {
      e.preventDefault()
      if (busy && !canSteer && canQueue) handleQueue()
      else handleSend()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const choosePathReference = (item: api.PathCompletionItem) => {
    const match = text.match(/(?:^|\s)@([^\s]*)$/)
    if (!match) return

    const isPreset = item.meta === 'reference'
    const isFolder = item.text.startsWith('@folder:') && !isPreset
    const prefixLength = isFolder ? '@folder:'.length : item.text.startsWith('@file:') ? '@file:'.length : 1
    const value = item.text.slice(prefixLength)
    const replacement = isPreset ? item.text : isFolder ? `@${value.replace(/\/$/, '')}/` : item.text
    const leadingSpace = match[0].startsWith(' ') ? ' ' : ''
    setText(current => current.slice(0, current.length - match[0].length) + leadingSpace + replacement + (isPreset ? '' : ' '))
    setPathItems([])
    setCompletionIndex(0)
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const addAttachments = async (selected: File[]) => {
    if (!selected.length) return
    const loaded = await Promise.all(
      selected.map(async (file, i) => ({
        id: `att-${Date.now()}-${i}`,
        name: file.name,
        size: file.size,
        dataUrl: await readFileAsDataUrl(file)
      }))
    )
    setAttachments(prev => [...prev, ...loaded])
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items?.length) return

    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }

    if (files.length > 0) {
      e.preventDefault()
      void addAttachments(files)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    e.target.value = ''
    void addAttachments(selected)
  }

  const handleAttachmentDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingFiles(false)
    if (!connected) return
    void addAttachments(Array.from(event.dataTransfer.files))
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

  const stopGatewayDictation = () => {
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') recorder.stop()
  }

  const startGatewayDictation = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setDictationHint(t.composer.dictationUnsupported)
      window.setTimeout(() => setDictationHint(null), 2600)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: BlobPart[] = []
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      recordingStreamRef.current = stream
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        recorderRef.current = null
        recordingStreamRef.current?.getTracks().forEach(track => track.stop())
        recordingStreamRef.current = null
        setIsDictating(false)
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        setDictationHint('正在通过网关转写…')
        void readBlobAsDataUrl(blob).then(dataUrl => api.transcribeAudio(dataUrl)).then(result => {
          if (!result.transcript.trim()) throw new Error('No speech detected')
          setText(current => current ? `${current} ${result.transcript}` : result.transcript)
          setDictationHint(null)
        }).catch(() => {
          setDictationHint('网关无法转写此录音。')
          window.setTimeout(() => setDictationHint(null), 2600)
        })
      }
      recorder.start()
      setIsDictating(true)
      setDictationHint('正在录音，点击麦克风完成。')
    } catch {
      setDictationHint('无法访问麦克风。')
      window.setTimeout(() => setDictationHint(null), 2600)
    }
  }

  const toggleDictation = () => {
    if (isDictating) {
      if (recognitionRef.current) recognitionRef.current.stop()
      else stopGatewayDictation()
      return
    }

    const win = window as unknown as Record<string, unknown>
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition
    if (!SpeechRecognition) {
      void startGatewayDictation()
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

  useEffect(() => () => {
    recognitionRef.current?.stop()
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    recordingStreamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

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
      className="shrink-0 w-full px-3 md:px-6 pb-4 pt-1 bg-gradient-to-t from-(--ui-bg-chrome) via-(--ui-bg-chrome) to-transparent relative z-20"
      style={{ paddingBottom: 'calc(0.75rem + var(--safe-area-bottom))' }}
    >
      <div className="max-w-4xl mx-auto w-full relative">
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

      {queuedPrompts.length > 0 && (
        <div className="mb-2 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) px-2.5 py-1.5">
          <div className="mb-1 flex items-center gap-1 text-[0.65rem] font-medium text-(--ui-text-tertiary)"><Codicon name="layers" className="text-xs" />{t.composer.queued(queuedPrompts.length)}{!busy ? <button className="ml-auto text-(--ui-accent) hover:opacity-70" onClick={drainQueuedPromptsNow}>{t.composer.sendNext}</button> : null}</div>
          <div className="space-y-1">
            {queuedPrompts.map(entry => <div className="flex items-center gap-2 text-[0.68rem] text-(--ui-text-secondary)" key={entry.id}><span className="min-w-0 flex-1 truncate">{entry.text}</span>{entry.attachments.length ? <Codicon name="attach" className="text-xs text-(--ui-text-quaternary)" /> : null}<button className="text-(--ui-text-quaternary) hover:text-(--ui-red)" onClick={() => { if (activeSessionId) removeQueuedPrompt(activeSessionId, entry.id) }} title={t.composer.removeQueued}><Codicon name="close" className="text-xs" /></button></div>)}
          </div>
        </div>
      )}

      {/* Attachments Preview Row */}
      {attachments.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar">
          {attachments.map(att => {
            const isImg = att.dataUrl.startsWith('data:image/')
            const sizeLabel = att.size ? ` (${(att.size / 1024).toFixed(0)}KB)` : ''

            return (
              <div
                key={att.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-(--ui-bg-card) border border-(--ui-stroke-tertiary) text-[0.7rem] text-(--ui-text-secondary) shadow-xs"
              >
                {isImg ? (
                  <img alt={att.name} className="size-5 rounded object-cover border border-(--ui-stroke-quaternary)" src={att.dataUrl} />
                ) : (
                  <Codicon name="file" className="text-xs text-(--ui-accent)" />
                )}
                <span className="truncate max-w-[130px]" title={att.name}>{att.name}{sizeLabel}</span>
                <button
                  onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                  className="text-(--ui-text-quaternary) hover:text-(--ui-red) ml-0.5"
                  title="Remove attachment"
                  type="button"
                >
                  <Codicon name="close" className="text-[0.65rem]" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Slash Command Completions */}
      {slashItems.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 max-h-[40vh] overflow-y-auto no-scrollbar rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) shadow-(--shadow-nous) p-1.5 z-50">
          {slashItems.map((item, index) => (
            <button
              key={item.text}
              type="button"
              onMouseEnter={() => setCompletionIndex(index)}
              onClick={() => {
                setText(item.text.includes(' ') ? item.text : `${item.text} `)
                setSlashItems([])
                setCompletionIndex(0)
                textareaRef.current?.focus()
              }}
              className={cn(
                'w-full flex flex-col items-start gap-0.5 px-2.5 py-1.5 rounded-lg text-left transition-colors',
                index === completionIndex ? 'bg-(--ui-row-active-background)' : 'hover:bg-(--chrome-action-hover)'
              )}
            >
              <span className="font-mono text-[0.7rem] text-(--ui-accent) font-medium truncate max-w-full">
                {item.display ?? item.text}
              </span>
              {item.meta && (
                <span className="text-[0.625rem] text-(--ui-text-tertiary) truncate max-w-full">
                  {item.meta}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {pathItems.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 max-h-[40vh] overflow-y-auto no-scrollbar rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) shadow-(--shadow-nous) p-1.5 z-50">
          <div className="px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-wide text-(--ui-text-quaternary)">Remote workspace references</div>
          {pathItems.map((item, index) => {
            const folder = item.text.startsWith('@folder:')
            const label = item.display || item.text.replace(/^@(file|folder):/, '')
            const iconName = item.text.startsWith('@git')
              ? 'git-branch'
              : item.text.startsWith('@tool')
              ? 'tools'
              : item.text.startsWith('@url')
              ? 'globe'
              : folder
              ? 'folder'
              : 'file'

            return (
              <button
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                  index === completionIndex ? 'bg-(--ui-row-active-background)' : 'hover:bg-(--chrome-action-hover)'
                )}
                key={`${item.text}-${index}`}
                onMouseEnter={() => setCompletionIndex(index)}
                onClick={() => choosePathReference(item)}
                type="button"
              >
                <Codicon className="shrink-0 text-xs text-(--ui-accent)" name={iconName} />
                <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-(--ui-text-primary)">{label}</span>
                <span className="shrink-0 text-[0.625rem] text-(--ui-text-quaternary)">{item.meta || (folder ? 'folder' : 'file')}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Main Composer Card — Desktop rounded glass card */}
      <div
        className={cn(
          'relative w-full rounded-2xl border border-(--ui-stroke-secondary) hover:border-(--ui-stroke-primary) bg-(--ui-bg-card) shadow-(--shadow-nous) transition-all focus-within:border-(--ui-accent) focus-within:ring-1 focus-within:ring-(--ui-accent)/20 backdrop-blur-md',
          isDraggingFiles && 'border-(--ui-accent) bg-(--ui-row-active-background)'
        )}
        onDragEnter={event => {
          if (event.dataTransfer.types.includes('Files')) setIsDraggingFiles(true)
        }}
        onDragLeave={event => {
          if (event.currentTarget === event.target) setIsDraggingFiles(false)
        }}
        onDragOver={event => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault()
        }}
        onDrop={handleAttachmentDrop}
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => void handleFileSelect(e)}
        />

        {/* 1. Main Input Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onInput={handleInput}
          placeholder={connected ? placeholder : t.composer.placeholderConnecting}
          rows={1}
          className={cn(
            'w-full min-h-[46px] max-h-[160px] resize-none bg-transparent',
            'px-4 pt-3 pb-2 text-[0.875rem] leading-relaxed text-(--ui-text-primary)',
            'placeholder:text-(--ui-text-quaternary) outline-none rounded-t-2xl no-scrollbar'
          )}
          disabled={!connected}
        />

        {/* Bottom Controls Bar */}
        <div className="flex items-center justify-between border-t border-(--ui-stroke-quaternary)/50 px-3 py-1.5 bg-(--ui-bg-card)/60 rounded-b-2xl">
          {/* Left: Add Attachment (+) Button */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="size-7 rounded-lg text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) grid place-items-center transition-colors cursor-pointer"
              title={t.composer.addAttachment}
            >
              <Codicon name="add" className="text-base" />
            </button>
          </div>

          {/* Right: Controls (Model, Dictation, Audio, Radio, Action) */}
          <div className="flex items-center gap-1.5">
            {/* Model Selector Dropdown Pill */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowModelPicker(!showModelPicker)}
                className="flex items-center gap-1.5 rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-bg-quaternary)/40 px-2.5 py-1 text-xs font-mono text-(--ui-text-secondary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors cursor-pointer"
              >
                <span className="max-w-[8rem] sm:max-w-[14rem] truncate font-medium">
                  {displayModelName}{pillMeta ? ` · ${pillMeta}` : ''}
                </span>
                <Codicon name="chevron-down" className="text-[0.6rem] text-(--ui-text-quaternary)" />
              </button>

              {/* Model Picker Modal Popover */}
              {showModelPicker && (
                <div className="absolute bottom-full right-0 mb-2 w-72 max-h-[60vh] overflow-y-auto no-scrollbar rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-card) shadow-2xl p-2.5 z-50 text-xs space-y-3">
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
                  <Switch
                    checked={fastOn}
                    onChange={toggleFast}
                    size="sm"
                  />
                </div>
              )}

              {reasoningSupported && (
                <div className="border-t border-(--ui-stroke-quaternary) pt-2">
                  <p className="text-[0.65rem] font-semibold text-(--ui-text-quaternary) uppercase tracking-wider mb-1.5">
                    {t.composer.reasoningSection}
                  </p>
                  <div className="flex gap-1 bg-(--ui-bg-chrome) p-1 rounded-lg">
                    {reasoningOptions.map(effort => (
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

        {/* 5. Audio Playback Mute / Unmute Button */}
        <button
          type="button"
          onClick={() => {
            const next = !audioMuted
            setAudioMuted(next)
            try {
              window.localStorage.setItem('hermes_audio_muted', String(next))
            } catch {
              // ignore
            }
          }}
          className={cn(
            'p-1 rounded-md shrink-0 transition-colors',
            audioMuted ? 'text-(--ui-text-quaternary)' : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary)'
          )}
          title={audioMuted ? '语音朗读已静音 (点击开启)' : '语音朗读已开启 (点击静音)'}
        >
          <Codicon name={audioMuted ? 'mute' : 'unmute'} className="text-sm" />
        </button>

        {/* 6. Voice Wave Activity / Mode Button */}
        <button
          type="button"
          onClick={() => setVoiceModeActive(!voiceModeActive)}
          className={cn(
            'p-1 rounded-md shrink-0 transition-colors',
            voiceModeActive
              ? 'bg-(--ui-accent)/15 text-(--ui-accent) animate-pulse'
              : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary)'
          )}
          title={voiceModeActive ? '退出实时语音模式' : '进入实时语音通话模式'}
        >
          <Codicon name="radio-tower" className="text-sm" />
        </button>

        {/* 5. Action Button (Send / Stop / Queue / Steer) */}
        {busy ? (
          canSteer ? (
            <>
              <button type="button" onClick={onStop} className="grid size-7 place-items-center rounded-lg border border-(--ui-stroke-tertiary) text-(--ui-text-tertiary) hover:text-(--ui-red) hover:bg-(--chrome-action-hover) shrink-0 transition-colors cursor-pointer" title={t.composer.stop}><Codicon name="debug-stop" className="text-xs" /></button>
              <button type="button" onClick={handleQueue} className="grid size-7 place-items-center rounded-lg border border-(--ui-stroke-tertiary) text-(--ui-text-tertiary) hover:text-(--ui-accent) hover:bg-(--chrome-action-hover) shrink-0 transition-colors cursor-pointer" title={t.composer.queue}><Codicon name="layers" className="text-xs" /></button>
              <button type="button" onClick={handleSend} className="grid size-7 place-items-center rounded-lg bg-(--ui-accent) text-white shrink-0 hover:opacity-90 transition-opacity cursor-pointer" title={t.composer.steer}><Codicon name="arrow-up" className="text-sm" /></button>
            </>
          ) : canQueue ? (
            <>
              <button type="button" onClick={onStop} className="grid size-7 place-items-center rounded-lg border border-(--ui-stroke-tertiary) text-(--ui-text-tertiary) hover:text-(--ui-red) hover:bg-(--chrome-action-hover) shrink-0 transition-colors cursor-pointer" title={t.composer.stop}><Codicon name="debug-stop" className="text-xs" /></button>
              <button type="button" onClick={handleQueue} className="grid size-7 place-items-center rounded-lg bg-(--ui-accent) text-white shrink-0 hover:opacity-90 transition-opacity cursor-pointer" title={t.composer.queue}><Codicon name="layers" className="text-xs" /></button>
            </>
          ) : (
            <button type="button" onClick={onStop} className="size-7 rounded-lg bg-(--ui-red)/15 text-(--ui-red) hover:bg-(--ui-red)/25 grid place-items-center shrink-0 active:scale-95 transition-all cursor-pointer" title={t.composer.stop}>
              <span className="size-2.5 rounded-xs bg-current" />
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSend}
            className={cn(
              'size-7 rounded-lg grid place-items-center shrink-0 transition-all cursor-pointer',
              canSend
                ? 'bg-(--ui-base) text-(--ui-bg-card) hover:opacity-90 active:scale-95 shadow-xs'
                : 'bg-(--ui-text-quaternary)/20 text-(--ui-text-quaternary) cursor-not-allowed'
            )}
            title={t.composer.send}
          >
            <Codicon name="arrow-up" className="text-sm font-bold" />
          </button>
        )}
          </div>
        </div>
      </div>
    </div>
  </div>
)
}
