import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { $connectionState } from '@/gateway'
import { createNewSession, sendMessage } from '@/sessions/store'
import { getUsageAnalytics, getStatus } from '@/gateway/api'
import { useI18n } from '@/i18n'
import { cn } from '@/ui/utils'
import { HomeCharts, type DailyTokenEntry, type ModelUsageEntry } from './home/HomeCharts'
import { HomeStatusCards } from './home/HomeStatusCards'

export type HomeLayoutMode = 'dashboard' | 'split' | 'minimal'
const LAYOUT_PREF_KEY = 'hermes_home_layout_mode'

interface NewSessionHomeProps {
  onSelectSession?: (id: string) => void
}

export function NewSessionHome({ onSelectSession }: NewSessionHomeProps) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
          getStatus(),
          getUsageAnalytics(14)
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
              (acc, m) => acc + (m.input_tokens || 0) + (m.output_tokens || 0),
              0
            ) || 1
            const models: ModelUsageEntry[] = res.by_model.map(m => {
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

  const submit = async (overrideText?: string) => {
    const value = (overrideText ?? text).trim()
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

  const handleSelectPrompt = (prompt: string) => {
    setText(prompt)
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

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

  // 核心会话输入卡片
  const composerCard = (
    <div className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-2xl border border-(--ui-stroke-primary) bg-(--ui-bg-card) shadow-(--shadow-nous) transition-all focus-within:border-(--ui-accent) focus-within:shadow-md">
        {/* 顶部分支与就绪状态栏 */}
        <div className="flex items-center justify-between border-b border-(--ui-stroke-quaternary) px-3 py-1.5 text-[11px] text-(--ui-text-tertiary) bg-(--ui-bg-quaternary)/30">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="codicon codicon-git-branch text-emerald-500" />
            <span className="font-semibold text-(--ui-text-secondary)">main</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-(--ui-text-quaternary)">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>网关工作区已就绪</span>
          </div>
        </div>

        <div className="flex items-end gap-2 p-3">
          <button
            type="button"
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.onchange = () => {
                if (input.files?.[0]) {
                  setText(prev => `${prev} [附件: ${input.files![0].name}] `)
                  textareaRef.current?.focus()
                }
              }
              input.click()
            }}
            className="p-1.5 rounded-lg text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors shrink-0 mb-1"
            title="添加附件"
          >
            <span className="codicon codicon-add text-base" />
          </button>
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
              'min-h-[56px] flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-(--ui-text-quaternary) leading-relaxed',
              sending && 'opacity-60'
            )}
          />
          <div className="flex items-center gap-1 shrink-0 mb-1">
            <div className="hidden sm:flex items-center gap-1 rounded-md bg-(--ui-bg-quaternary) px-2 py-1 text-[11px] font-mono text-(--ui-text-tertiary)" title="默认路由模型">
              <span>Hermes</span>
              <span className="codicon codicon-chevron-down text-[10px]" />
            </div>
            <button
              type="button"
              className="p-1.5 rounded-lg text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
              title="语音输入"
            >
              <span className="codicon codicon-mic text-sm" />
            </button>
            <button
              disabled={!text.trim() || sending}
              onClick={() => void submit()}
              className="flex size-8 items-center justify-center rounded-xl bg-(--ui-base) text-(--ui-bg-card) shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-20"
              aria-label={t.home.start}
            >
              <span className="codicon codicon-arrow-up text-base font-bold" />
            </button>
          </div>
        </div>
        {error && <p className="px-3 pb-2 text-(--conversation-tool-font-size) text-(--ui-red)">{error}</p>}
      </div>
    </div>
  )

  // 极简模式渲染
  if (layoutMode === 'minimal') {
    return (
      <div className="relative flex h-full min-h-0 flex-col items-center justify-between overflow-y-auto px-4 py-8">
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
                className="rounded-full border border-(--ui-stroke-primary) bg-(--ui-bg-card) px-3 py-1 text-xs text-(--ui-text-tertiary) shadow-sm transition-all hover:border-(--ui-accent) hover:text-(--ui-text-primary) active:scale-95"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="h-8" />
      </div>
    )
  }

  // 双栏工作台模式渲染
  if (layoutMode === 'split') {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 md:px-8">
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
    <div className="relative flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 md:px-8">
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
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
