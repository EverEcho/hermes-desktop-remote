import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { $connectionState } from '@/gateway'
import { $currentModel, $currentProvider, createNewSession, sendMessage } from '@/sessions/store'
import * as api from '@/gateway/api'
import type { ModelOptionProvider } from '@/types/hermes'
import { Codicon } from '@/ui/Codicon'
import { useI18n } from '@/i18n'
import { cn } from '@/ui/utils'
import { HomeCharts, type DailyTokenEntry, type ModelUsageEntry } from './home/HomeCharts'
import { HomeStatusCards } from './home/HomeStatusCards'

export type HomeLayoutMode = 'dashboard' | 'split' | 'minimal'
const LAYOUT_PREF_KEY = 'hermes_home_layout_mode'

function prettifyModel(id: string): string {
  const word = id.split(/[-_.]/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  return word || id
}

interface NewSessionHomeProps {
  onSelectSession?: (id: string) => void
}

export function NewSessionHome({ onSelectSession }: NewSessionHomeProps) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Array<{ name: string; dataUrl: string }>>([])
  const [providers, setProviders] = useState<ModelOptionProvider[]>([])
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [isDictating, setIsDictating] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)

  const currentModel = useStore($currentModel)
  const currentProvider = useStore($currentProvider)

  // 布局模式状态（支持持久化）
  const [layoutMode, setLayoutMode] = useState<HomeLayoutMode>(() => {
    const saved = window.localStorage.getItem(LAYOUT_PREF_KEY)
    if (saved === 'split' || saved === 'minimal' || saved === 'dashboard') {
      return saved
    }
    return 'dashboard'
  })

  // 真实用量数据状态
  const [dailyData, setDailyData] = useState<DailyTokenEntry[] | undefined>(undefined)
  const [modelData, setModelData] = useState<ModelUsageEntry[] | undefined>(undefined)
  const [gatewayVersion, setGatewayVersion] = useState<string>('v0.18.2')
  const [pingMs, setPingMs] = useState<number>(12)

  const connectionState = useStore($connectionState)

  // 切换布局
  const handleLayoutChange = (mode: HomeLayoutMode) => {
    setLayoutMode(mode)
    window.localStorage.setItem(LAYOUT_PREF_KEY, mode)
  }

  // 尝试拉取网关状态和用量统计
  useEffect(() => {
    let cancelled = false
    const loadStats = async () => {
      if (connectionState !== 'open') return
      const t0 = performance.now()
      try {
        const [statusRes, analyticsRes] = await Promise.allSettled([
          api.getStatus(),
          api.getUsageAnalytics(14)
        ])

        if (cancelled) return
        const elapsed = Math.round(performance.now() - t0)
        setPingMs(elapsed > 0 ? elapsed : 8)

        if (statusRes.status === 'fulfilled' && statusRes.value?.version) {
          setGatewayVersion(statusRes.value.version)
        }

        if (analyticsRes.status === 'fulfilled' && analyticsRes.value) {
          const res = analyticsRes.value
          const dailyRaw = (res as unknown as Record<string, unknown>).daily
          if (Array.isArray(dailyRaw) && dailyRaw.length > 0) {
            const days: DailyTokenEntry[] = dailyRaw.map((d: Record<string, unknown>) => ({
              day: String(d.day ?? ''),
              inputTokens: Number(d.input_tokens ?? 0),
              outputTokens: Number(d.output_tokens ?? 0)
            }))
            setDailyData(days)
          }
          if (res.by_model && res.by_model.length > 0) {
            const totalTokens = res.by_model.reduce(
              (acc: number, m: { input_tokens?: number; output_tokens?: number }) => acc + (m.input_tokens || 0) + (m.output_tokens || 0),
              0
            ) || 1
            const models: ModelUsageEntry[] = res.by_model.map((m: { model: string; input_tokens?: number; output_tokens?: number }) => {
              const toks = (m.input_tokens || 0) + (m.output_tokens || 0)
              return {
                model: m.model,
                tokens: toks,
                percentage: Math.min(100, Math.round((toks / totalTokens) * 100))
              }
            })
            setModelData(models)
          }
        }
      } catch {
        // 后端若无对应用量接口则安静保持优雅 fallback
      }
    }

    void loadStats()
    return () => {
      cancelled = true
    }
  }, [connectionState])

  // 拉取网关可用模型列表
  useEffect(() => {
    if (connectionState !== 'open') return
    let cancelled = false

    api.getModelInfo().then(info => {
      if (cancelled || !info.model) return
      if (!$currentModel.get()) {
        $currentModel.set(info.model)
        if (info.provider) $currentProvider.set(info.provider)
      }
    }).catch(() => {})

    api.getModelOptions().then(options => {
      if (cancelled) return
      setProviders(options.providers ?? [])
      if (options.model && !$currentModel.get()) {
        $currentModel.set(options.model)
        if (options.provider) $currentProvider.set(options.provider)
      }
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [connectionState])

  // 点击外部关闭模型选择器
  useEffect(() => {
    if (!showModelPicker) return
    const handleClick = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showModelPicker])

  const submit = async (overrideText?: string) => {
    const value = (overrideText ?? text).trim()
    if (!value || sending) return
    setSending(true)
    setError(null)
    try {
      const id = await createNewSession()
      if (id) {
        setText('')
        const atts = attachments.map(a => ({ data_url: a.dataUrl, filename: a.name }))
        setAttachments([])
        await sendMessage(value, {
          model: currentModel || undefined,
          provider: currentProvider || undefined,
          attachments: atts.length ? atts : undefined
        })
      } else {
        setError(t.home.startFailed)
      }
    } finally {
      setSending(false)
    }
  }

  const handleSelectPrompt = (prompt: string) => {
    setText(prompt)
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAttachments(prev => [...prev, { name: file.name, dataUrl: reader.result as string }])
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const toggleDictation = () => {
    interface SpeechResultEvent {
      resultIndex: number
      results: {
        length: number
        [index: number]: {
          [index: number]: { transcript: string }
        }
      }
    }

    interface SpeechRecognitionInstance {
      continuous: boolean
      interimResults: boolean
      lang: string
      onresult: ((e: SpeechResultEvent) => void) | null
      onend: (() => void) | null
      onerror: (() => void) | null
      start: () => void
      stop: () => void
    }

    type SpeechRecognitionClass = new () => SpeechRecognitionInstance

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionClass
      webkitSpeechRecognition?: SpeechRecognitionClass
    }
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition

    if (!SpeechRecognition) return

    if (isDictating) {
      recognitionRef.current?.stop()
      setIsDictating(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = navigator.language || 'zh-CN'
    recognition.onresult = (e: SpeechResultEvent) => {
      let res = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        res += e.results[i][0].transcript
      }
      setText(prev => (prev ? `${prev} ${res}` : res))
    }
    recognition.onend = () => setIsDictating(false)
    recognition.onerror = () => setIsDictating(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsDictating(true)
  }


  const displayModelName = currentModel
    ? prettifyModel(currentModel.replace(/^.*\//, ''))
    : 'Hermes'

  const moaPresets = providers.find(p => p.slug.toLowerCase() === 'moa')?.models ?? []
  const modelProviders = providers.filter(p => p.slug.toLowerCase() !== 'moa')

  // 布局切换工具栏组件
  const layoutSwitcher = (
    <div className="inline-flex items-center rounded-lg border border-(--ui-stroke-primary) bg-(--ui-bg-card)/80 p-0.5 shadow-sm backdrop-blur-md">
      <button
        type="button"
        title={t.home.layout.dashboard}
        onClick={() => handleLayoutChange('dashboard')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
          layoutMode === 'dashboard'
            ? 'bg-(--ui-base) text-(--ui-bg-card) shadow-sm'
            : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary)'
        )}
      >
        <span className="codicon codicon-dashboard text-xs" />
        <span className="hidden sm:inline">{t.home.layout.dashboard}</span>
      </button>

      <button
        type="button"
        title={t.home.layout.split}
        onClick={() => handleLayoutChange('split')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
          layoutMode === 'split'
            ? 'bg-(--ui-base) text-(--ui-bg-card) shadow-sm'
            : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary)'
        )}
      >
        <span className="codicon codicon-split-horizontal text-xs" />
        <span className="hidden sm:inline">{t.home.layout.split}</span>
      </button>

      <button
        type="button"
        title={t.home.layout.minimal}
        onClick={() => handleLayoutChange('minimal')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
          layoutMode === 'minimal'
            ? 'bg-(--ui-base) text-(--ui-bg-card) shadow-sm'
            : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary)'
        )}
      >
        <span className="codicon codicon-screen-normal text-xs" />
        <span className="hidden sm:inline">{t.home.layout.minimal}</span>
      </button>
    </div>
  )

  // 原版 Hermes Desktop 输入卡片（无冗余顶栏，原版控制栏与模型切换菜单）
  const composerCard = (
    <div className="relative w-full z-30">
      <div className="relative w-full rounded-2xl border border-(--ui-stroke-secondary) hover:border-(--ui-stroke-primary) bg-(--ui-bg-card) shadow-(--shadow-nous) transition-all focus-within:border-(--ui-accent) focus-within:ring-1 focus-within:ring-(--ui-accent)/20 backdrop-blur-md">
        {/* 输入框主体 */}
        <textarea
          ref={textareaRef}
          value={text}
          rows={layoutMode === 'minimal' ? 2 : 3}
          placeholder={t.home.placeholder}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          className={cn(
            'w-full min-h-[68px] resize-none bg-transparent px-4 pt-3.5 pb-2 text-[0.875rem] outline-none placeholder:text-(--ui-text-quaternary) text-(--ui-text-primary) leading-relaxed rounded-t-2xl',
            sending && 'opacity-60'
          )}
        />

        {/* 附件标签列表 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="flex items-center gap-1 rounded-md bg-(--ui-bg-quaternary) px-2 py-0.5 text-xs text-(--ui-text-secondary)">
                <Codicon name="file" className="text-xs" />
                <span className="max-w-[12rem] truncate">{att.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                  className="hover:text-(--ui-red) ml-0.5 cursor-pointer"
                >
                  <Codicon name="close" className="text-[10px]" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 底部微操作栏（对齐原版 Desktop Controls） */}
        <div className="flex items-center justify-between border-t border-(--ui-stroke-quaternary)/50 px-3 py-2 bg-(--ui-bg-card)/60 rounded-b-2xl">
          {/* 左侧：添加附件按钮 */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="size-7 rounded-lg text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) grid place-items-center transition-colors cursor-pointer"
              title="添加附件"
            >
              <Codicon name="add" className="text-base" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {/* 右侧：模型切换胶囊、语音输入、发送按钮 */}
          <div className="flex items-center gap-1.5">
            {/* 模型选择器胶囊 */}
            <div className="relative" ref={modelPickerRef}>
              <button
                type="button"
                onClick={() => setShowModelPicker(!showModelPicker)}
                className="flex items-center gap-1.5 rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-bg-quaternary)/40 px-2.5 py-1 text-xs font-mono text-(--ui-text-secondary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors cursor-pointer"
                title="切换当前模型"
              >
                <span className="max-w-[10rem] sm:max-w-[14rem] truncate font-medium">
                  {displayModelName}
                </span>
                <Codicon name="chevron-down" className="text-[0.65rem] text-(--ui-text-quaternary)" />
              </button>

              {/* 模型选择弹出菜单 */}
              {showModelPicker && (
                <div className="absolute top-full right-0 mt-2 w-72 max-h-[320px] overflow-y-auto no-scrollbar rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-card) shadow-2xl p-2.5 z-50 text-xs space-y-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold text-(--ui-text-quaternary) uppercase tracking-wider mb-1.5">
                      {t.composer.modelSection}
                    </p>
                    {modelProviders.length === 0 && (
                      <p className="px-2.5 py-1.5 text-(--ui-text-tertiary)">
                        {connectionState === 'open' ? t.composer.noModels : t.composer.gatewayClosed}
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
                                  onClick={() => {
                                    $currentModel.set(model)
                                    $currentProvider.set(provider.slug)
                                    setShowModelPicker(false)
                                  }}
                                  className={cn(
                                    'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left font-mono text-[0.7rem] transition-colors cursor-pointer',
                                    currentModel === model && currentProvider === provider.slug
                                      ? 'bg-(--ui-row-active-background) text-(--ui-accent) font-medium'
                                      : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
                                  )}
                                >
                                  <span className="truncate">{model}</span>
                                  {currentModel === model && currentProvider === provider.slug && (
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
                            onClick={() => {
                              $currentModel.set(preset)
                              $currentProvider.set('moa')
                              setShowModelPicker(false)
                            }}
                            className={cn(
                              'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left font-mono text-[0.7rem] transition-colors cursor-pointer',
                              currentModel === preset && currentProvider === 'moa'
                                ? 'bg-(--ui-row-active-background) text-(--ui-accent) font-medium'
                                : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
                            )}
                          >
                            <span className="truncate">{preset}</span>
                            {currentModel === preset && currentProvider === 'moa' && (
                              <Codicon name="check" className="text-xs shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 语音听写按钮 */}
            <button
              type="button"
              onClick={toggleDictation}
              className={cn(
                'size-7 rounded-lg grid place-items-center transition-colors cursor-pointer',
                isDictating
                  ? 'bg-(--ui-red) text-white animate-pulse'
                  : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover)'
              )}
              title={isDictating ? '正在聆听…' : '语音输入'}
            >
              <Codicon name="mic" className="text-sm" />
            </button>

            {/* 发送按钮 */}
            <button
              disabled={!text.trim() || sending}
              onClick={() => void submit()}
              className="size-7 rounded-lg bg-(--ui-base) text-(--ui-bg-card) grid place-items-center shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:opacity-20 cursor-pointer"
              aria-label={t.home.start}
            >
              {sending ? (
                <Codicon name="loading" className="animate-spin text-sm" />
              ) : (
                <Codicon name="arrow-up" className="text-sm font-bold" />
              )}
            </button>
          </div>
        </div>
        {error && <p className="px-4 pb-2 text-(--conversation-tool-font-size) text-(--ui-red)">{error}</p>}
      </div>
    </div>
  )


  // 极简模式渲染
  if (layoutMode === 'minimal') {
    return (
      <div className="relative flex h-full min-h-0 flex-col items-center justify-between overflow-y-auto px-4 py-8 pb-[calc(5rem+var(--safe-area-bottom))] overscroll-contain">
        <div className="flex w-full max-w-3xl items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-widest text-(--ui-text-quaternary)">
            HERMES DESKTOP
          </span>
          {layoutSwitcher}
        </div>

        <div className="relative flex w-full max-w-2xl flex-col items-center">
          <div className="pointer-events-none absolute -top-16 inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--ui-accent) 12%, transparent), transparent 50%)' }} />
          <div className="relative text-center mb-8">
            <div className="text-[clamp(2.4rem,7vw,4.5rem)] font-extrabold tracking-[-0.06em] text-(--ui-accent)">
              HERMES AGENT
            </div>
            <p className="mt-2 text-xs text-(--ui-text-tertiary)">{t.home.tagline}</p>
          </div>

          {composerCard}

          {/* 快捷目标胶囊 */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[
              t.home.quickStart.troubleshoot,
              t.home.quickStart.optimize,
              t.home.quickStart.unitTest,
              t.home.quickStart.gitReview
            ].map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPrompt(prompt)}
                className="rounded-full border border-(--ui-stroke-primary) bg-(--ui-bg-card) px-3 py-1 text-xs text-(--ui-text-tertiary) shadow-sm transition-all hover:border-(--ui-accent) hover:text-(--ui-text-primary) active:scale-95 cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="h-16 shrink-0" />
      </div>
    )
  }

  // 双栏工作台模式渲染
  if (layoutMode === 'split') {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 md:px-8 pb-[calc(5rem+var(--safe-area-bottom))] overscroll-contain">
        <div className="mb-6 flex items-center justify-between border-b border-(--ui-stroke-quaternary) pb-4">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold tracking-tight text-(--ui-accent)">HERMES AGENT</div>
            <span className="rounded bg-(--ui-bg-quaternary) px-2 py-0.5 text-[11px] font-mono text-(--ui-text-secondary)">
              Workbench
            </span>
          </div>
          {layoutSwitcher}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 flex-1">
          {/* 左侧：输入与快捷启动 */}
          <div className="flex flex-col gap-6 lg:col-span-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-(--ui-text-primary)">开启新的会话</h2>
              <p className="text-xs text-(--ui-text-tertiary)">{t.home.tagline}</p>
            </div>

            {composerCard}

            <HomeStatusCards
              onSelectPrompt={handleSelectPrompt}
              onSelectSession={onSelectSession}
              pingMs={pingMs}
              version={gatewayVersion}
            />
          </div>

          {/* 右侧：图表与系统全景 */}
          <div className="flex flex-col gap-6 lg:col-span-7">
            <HomeCharts
              dailyData={dailyData}
              modelData={modelData}
            />
          </div>
        </div>
      </div>
    )
  }

  // 默认：仪表盘全景模式 (Dashboard)
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 md:px-8 pb-[calc(6rem+var(--safe-area-bottom))] overscroll-contain">
      {/* 顶部标题与布局切换 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-xl font-bold tracking-[-0.04em] text-(--ui-accent)">HERMES AGENT</div>
          <span className="rounded bg-(--ui-bg-quaternary) px-2 py-0.5 text-[10px] font-mono text-(--ui-text-tertiary)">
            Dashboard
          </span>
        </div>
        {layoutSwitcher}
      </div>

      {/* 主输入区 */}
      <div className="mx-auto w-full max-w-3xl mb-8 flex flex-col items-center">
        <p className="mb-3 text-center text-xs text-(--ui-text-tertiary)">{t.home.tagline}</p>
        {composerCard}
      </div>

      {/* PC 底部的状态卡片与图表 */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-[calc(5rem+var(--safe-area-bottom))]">
        {/* 系统健康与指标卡片 */}
        <HomeStatusCards
          onSelectPrompt={handleSelectPrompt}
          onSelectSession={onSelectSession}
          pingMs={pingMs}
          version={gatewayVersion}
        />

        {/* 吞吐图表与分布 */}
        <HomeCharts
          dailyData={dailyData}
          modelData={modelData}
        />
      </div>
    </div>
  )
}

