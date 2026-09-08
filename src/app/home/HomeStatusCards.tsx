import { useStore } from '@nanostores/react'
import { $connectionState, $gatewayProfile } from '@/gateway'
import { $sessions, $cronSessions, $currentCwd } from '@/sessions/store'
import { useI18n } from '@/i18n'
import { cn } from '@/ui/utils'

interface HomeStatusCardsProps {
  onSelectPrompt?: (text: string) => void
  onSelectSession?: (id: string) => void
  className?: string
  pingMs?: number
  version?: string
}

export function HomeStatusCards({
  onSelectPrompt,
  onSelectSession,
  className,
  pingMs = 12,
  version = 'v0.18.2'
}: HomeStatusCardsProps) {
  const { t } = useI18n()
  const connectionState = useStore($connectionState)
  const gatewayProfile = useStore($gatewayProfile)
  const currentCwd = useStore($currentCwd)
  const sessions = useStore($sessions)
  const cronSessions = useStore($cronSessions)

  const isConnected = connectionState === 'open'
  const isConnecting = connectionState === 'connecting'

  const quickPrompts = [
    { key: 'troubleshoot', label: t.home.quickStart.troubleshoot },
    { key: 'optimize', label: t.home.quickStart.optimize },
    { key: 'unitTest', label: t.home.quickStart.unitTest },
    { key: 'gitReview', label: t.home.quickStart.gitReview },
    { key: 'explainArch', label: t.home.quickStart.explainArch }
  ]

  const recentSessions = sessions.slice(0, 3)

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 顶部系统健康 & 会话指标卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* 网关连接状态 */}
        <div className="flex flex-col justify-between rounded-xl border border-(--ui-stroke-primary) bg-(--ui-bg-card) p-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-(--ui-text-tertiary)">
              {t.home.status.gatewayOnline}
            </span>
            <span
              className={cn(
                'size-2 rounded-full ring-2 ring-offset-1 ring-offset-(--ui-bg-card)',
                isConnected && 'bg-emerald-500 ring-emerald-500/30 animate-pulse',
                isConnecting && 'bg-amber-500 ring-amber-500/30 animate-ping',
                !isConnected && !isConnecting && 'bg-rose-500 ring-rose-500/30'
              )}
            />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-(--ui-text-primary)">
              {isConnected ? t.home.status.connected : isConnecting ? t.home.status.connecting : t.home.status.disconnected}
            </span>
            <span className="text-[11px] font-mono text-emerald-500/90">{isConnected ? `${pingMs}ms` : '--'}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-(--ui-text-quaternary) truncate">
            <span className="codicon codicon-tag text-[10px]" />
            <span>{version}</span>
          </div>
        </div>

        {/* 活动 Profile */}
        <div className="flex flex-col justify-between rounded-xl border border-(--ui-stroke-primary) bg-(--ui-bg-card) p-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-(--ui-text-tertiary)">
              {t.home.status.activeProfile}
            </span>
            <span className="codicon codicon-person text-xs text-(--ui-text-quaternary)" />
          </div>
          <div className="mt-2">
            <span className="text-sm font-semibold text-(--ui-text-primary) truncate block">
              {gatewayProfile || 'default'}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-(--ui-text-quaternary) truncate">
            <span className="codicon codicon-shield text-[10px]" />
            <span>{t.home.status.isolatedRuntime}</span>
          </div>
        </div>

        {/* 会话总数 */}
        <div className="flex flex-col justify-between rounded-xl border border-(--ui-stroke-primary) bg-(--ui-bg-card) p-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-(--ui-text-tertiary)">
              {t.home.status.totalSessions}
            </span>
            <span className="codicon codicon-comment-discussion text-xs text-(--ui-text-quaternary)" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-bold text-(--ui-text-primary)">{sessions.length}</span>
            <span className="text-[11px] text-(--ui-text-tertiary)">{t.home.status.active}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-(--ui-text-quaternary)">
            <span className="codicon codicon-history text-[10px]" />
            <span>{t.home.status.syncedGateway}</span>
          </div>
        </div>

        {/* 定时与后台任务 */}
        <div className="flex flex-col justify-between rounded-xl border border-(--ui-stroke-primary) bg-(--ui-bg-card) p-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-(--ui-text-tertiary)">
              {t.home.status.cronJobs}
            </span>
            <span className="codicon codicon-clock text-xs text-(--ui-text-quaternary)" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-bold text-(--ui-text-primary)">{cronSessions.length}</span>
            <span className="text-[11px] text-(--ui-text-tertiary)">{t.home.status.jobs}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-(--ui-text-quaternary) truncate">
            <span className="codicon codicon-pulse text-[10px]" />
            <span>{t.home.status.daemonReady}</span>
          </div>
        </div>
      </div>

      {/* 工作空间路径轻量条 */}
      {currentCwd && (
        <div className="flex items-center gap-2 rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-bg-card)/60 px-3 py-1.5 text-xs text-(--ui-text-tertiary)">
          <span className="codicon codicon-folder text-(--ui-accent)" />
          <span className="font-medium text-(--ui-text-secondary)">{t.home.status.currentCwd}:</span>
          <span className="font-mono text-[11px] text-(--ui-text-primary) truncate">{currentCwd}</span>
        </div>
      )}

      {/* 快捷目标胶囊区 (Quick Goals Pills) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="codicon codicon-zap text-xs text-(--ui-accent)" />
          <span className="text-xs font-semibold uppercase tracking-wider text-(--ui-text-primary)">
            {t.home.quickStart.title}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map(p => (
            <button
              key={p.key}
              onClick={() => onSelectPrompt?.(p.label)}
              type="button"
              className="group flex items-center gap-1.5 rounded-lg border border-(--ui-stroke-primary) bg-(--ui-bg-card) px-3 py-1.5 text-xs text-(--ui-text-secondary) shadow-sm transition-all hover:border-(--ui-accent) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary) active:scale-[0.98]"
            >
              <span>{p.label}</span>
              <span className="codicon codicon-arrow-small-right text-[10px] opacity-0 transition-opacity group-hover:opacity-100 text-(--ui-accent)" />
            </button>
          ))}
        </div>
      </div>

      {/* 最近会话快速恢复 (Recent Sessions) */}
      {recentSessions.length > 0 && onSelectSession && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="codicon codicon-history text-xs text-(--ui-accent)" />
              <span className="text-xs font-semibold uppercase tracking-wider text-(--ui-text-primary)">
                {t.home.recentSessions.title}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {recentSessions.map(sess => (
              <button
                key={sess.id}
                type="button"
                onClick={() => onSelectSession(sess.id)}
                className="group flex flex-col items-start rounded-xl border border-(--ui-stroke-primary) bg-(--ui-bg-card) p-3 text-left shadow-sm transition-all hover:border-(--ui-accent) hover:bg-(--ui-bg-elevated) hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-medium text-xs text-(--ui-text-primary) truncate max-w-[190px] group-hover:text-(--ui-accent)">
                    {sess.title || 'Untitled session'}
                  </span>
                  <span className="codicon codicon-chevron-right text-xs opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-(--ui-accent)" />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-(--ui-text-quaternary)">
                  <span>ID: {sess.id.slice(0, 8)}</span>
                  {sess.updated_at && <span>· {new Date(sess.updated_at).toLocaleDateString()}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
