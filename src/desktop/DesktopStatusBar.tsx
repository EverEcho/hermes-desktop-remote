import { useState, useEffect, useRef } from 'react'
import { useStore } from '@nanostores/react'
import { $connectionState, reconnectGateway } from '@/gateway'
import { $currentCwd } from '@/sessions/store'
import { getGatewayBaseUrl } from '@/gateway/http-client'
import { getStatus } from '@/gateway/api'
import { $approvalMode, setApprovalMode, syncApprovalMode } from '@/store/approval-mode'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

export type DesktopStatusFeature =
  | 'skills'
  | 'messaging'
  | 'workspace'
  | 'artifacts'
  | 'agents'
  | 'archived'
  | 'project'
  | 'memory'
  | 'learning'
  | 'logs'
  | 'computer-use'
  | 'connections'
  | 'cron'
  | 'profiles'
  | 'webhooks'
  | 'terminal'
  | 'settings'
  | 'gateway'
  | 'logout'

export interface DesktopStatusBarProps {
  onOpenCommandPalette: () => void
  onOpenCron: () => void
  onOpenWebhooks: () => void
  onOpenAgents: () => void
  onOpenConnections: () => void
  onChangeGateway: () => void
  onToggleWorkspace?: () => void
  clientVersion?: string
  leftSidebarVisible?: boolean
  sessionScope?: 'active' | 'all'
  onToggleSessionScope?: () => void
  onFeature?: (feature: DesktopStatusFeature) => void
  onNewSession?: () => void
}

export function DesktopStatusBar({
  onOpenCommandPalette,
  onOpenCron,
  onOpenWebhooks,
  onOpenAgents,
  onOpenConnections,
  onChangeGateway,
  onToggleWorkspace,
  clientVersion = 'v0.17.0',
  leftSidebarVisible = true,
  sessionScope = 'active',
  onToggleSessionScope,
  onFeature,
  onNewSession
}: DesktopStatusBarProps) {
  const { t } = useI18n()
  const sb = t.desktop.statusbar
  const connectionState = useStore($connectionState)
  const currentCwd = useStore($currentCwd)
  const approvalMode = useStore($approvalMode)

  const [gatewayMenuOpen, setGatewayMenuOpen] = useState(false)
  const [approvalMenuOpen, setApprovalMenuOpen] = useState(false)
  const [copiedCwd, setCopiedCwd] = useState(false)
  const [backendVersion, setBackendVersion] = useState('v0.20.6 (+6886)')
  const [pingMs, setPingMs] = useState<number>(12)
  const [sessionDuration, setSessionDuration] = useState('0:27')
  const sessionStartedAtRef = useRef<number>(Date.now() - 27_000)

  const menuRef = useRef<HTMLDivElement>(null)
  const approvalMenuRef = useRef<HTMLDivElement>(null)

  // 会话时长计时器
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000))
      const mm = Math.floor(elapsed / 60)
      const ss = String(elapsed % 60).padStart(2, '0')
      setSessionDuration(`${mm}:${ss}`)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 提取当前网关 host（例如 192.168.10.5:9119）
  const gatewayHost = (() => {
    try {
      const url = getGatewayBaseUrl()
      if (url) {
        const parsed = new URL(url.startsWith('http') ? url : `http://${url}`)
        return parsed.host || url
      }
    } catch {
      // ignore
    }
    return typeof window !== 'undefined' ? window.location.host : '192.168.10.5:9119'
  })()

  // 提取项目名称
  const projectName = (() => {
    if (!currentCwd) return 'freelo'
    const parts = currentCwd.replace(/\/+$/, '').split('/')
    return parts[parts.length - 1] || 'freelo'
  })()

  // 周期性拉取后端状态及同步审批模式
  useEffect(() => {
    let cancelled = false
    const fetchStatus = async () => {
      if (connectionState !== 'open') return
      const t0 = performance.now()
      try {
        const res = await getStatus()
        if (cancelled) return
        const elapsed = Math.round(performance.now() - t0)
        setPingMs(elapsed > 0 ? elapsed : 10)
        if (res?.version) {
          setBackendVersion(res.version.startsWith('v') ? res.version : `v${res.version}`)
        }
      } catch {
        // ignore
      }
      try {
        await syncApprovalMode()
      } catch {
        // ignore
      }
    }

    void fetchStatus()
    const timer = setInterval(() => void fetchStatus(), 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [connectionState])

  // 点击外部关闭网关菜单及审批模式菜单
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setGatewayMenuOpen(false)
      }
      if (approvalMenuRef.current && !approvalMenuRef.current.contains(e.target as Node)) {
        setApprovalMenuOpen(false)
      }
    }
    if (gatewayMenuOpen || approvalMenuOpen) {
      document.addEventListener('mousedown', handleDocumentClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
    }
  }, [gatewayMenuOpen, approvalMenuOpen])

  const handleCopyCwd = () => {
    if (currentCwd) {
      void navigator.clipboard.writeText(currentCwd)
      setCopiedCwd(true)
      setTimeout(() => setCopiedCwd(false), 2000)
    }
  }

  const isConnected = connectionState === 'open'
  const isConnecting = connectionState === 'connecting'

  return (
    <footer className="relative flex h-7 w-full shrink-0 select-none items-stretch border-t border-(--ui-stroke-tertiary) bg-(--ui-bg-card) text-[11px] text-(--ui-text-secondary) font-sans z-40">
      {/* 1. Left 区 (与侧边栏对齐，处于同一水平面) */}
      <div
        className={cn(
          'flex items-center gap-1 shrink-0 px-2 border-r border-(--ui-stroke-tertiary) bg-(--ui-bg-sidebar)/40 transition-[width]',
          leftSidebarVisible ? 'w-[13.25rem] justify-between' : 'w-auto'
        )}
      >
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
          {/* 全部 Profile 切换 (layers) */}
          <button
            type="button"
            onClick={onToggleSessionScope}
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded transition-colors',
              sessionScope === 'all'
                ? 'bg-(--ui-bg-elevated) text-(--ui-accent) shadow-2xs'
                : 'text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover)'
            )}
            title={sessionScope === 'all' ? t.sidebar.currentProfileSessions : t.sidebar.allProfileSessions}
          >
            <Codicon name="layers" className="text-xs" />
          </button>

          {/* Computer Use 桌面权限 */}
          <button
            type="button"
            onClick={() => onFeature?.('computer-use')}
            className="relative flex size-5 shrink-0 items-center justify-center rounded text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
            title={t.sidebar.computerUse}
          >
            <Codicon name="device-camera-video" className="text-xs" />
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-amber-500 ring-1 ring-(--ui-bg-card)" />
          </button>

          {/* 主页 / 新会话 (Home) */}
          <button
            type="button"
            onClick={onNewSession}
            className="flex size-5 shrink-0 items-center justify-center rounded text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
            title={t.sidebar.home}
          >
            <Codicon name="home" className="text-xs" />
          </button>

          {/* 分隔符 */}
          <div className="h-3 w-px bg-(--ui-stroke-tertiary) shrink-0 mx-0.5" />

          {/* 网关连接 */}
          <button
            type="button"
            onClick={() => onFeature?.('connections')}
            className="flex size-5 shrink-0 items-center justify-center rounded text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
            title={t.sidebar.connections}
          >
            <Codicon name="server" className="text-xs" />
          </button>

          {/* 远程终端 */}
          <button
            type="button"
            onClick={() => onFeature?.('terminal')}
            className="flex size-5 shrink-0 items-center justify-center rounded text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
            title={t.sidebar.terminal}
          >
            <Codicon name="terminal" className="text-xs" />
          </button>

          {/* 快捷彩色标签 C, P, U */}
          <button
            type="button"
            onClick={() => onFeature?.('profiles')}
            className="flex size-4.5 shrink-0 items-center justify-center rounded bg-purple-500/15 font-bold text-[9px] text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-transform active:scale-95"
            title="Profile: C"
          >
            C
          </button>
          <button
            type="button"
            onClick={() => onFeature?.('profiles')}
            className="flex size-4.5 shrink-0 items-center justify-center rounded bg-rose-500/15 font-bold text-[9px] text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition-transform active:scale-95"
            title="Profile: P"
          >
            P
          </button>
          <button
            type="button"
            onClick={() => onFeature?.('profiles')}
            className="flex size-4.5 shrink-0 items-center justify-center rounded bg-emerald-500/15 font-bold text-[9px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-transform active:scale-95"
            title="Profile: U"
          >
            U
          </button>
        </div>

        {/* 更多 (···) */}
        <button
          type="button"
          onClick={() => onFeature?.('profiles')}
          className="flex size-5 shrink-0 items-center justify-center rounded text-(--ui-text-tertiary) hover:text-(--ui-text-primary) hover:bg-(--chrome-action-hover) transition-colors"
          title="管理角色与配置 (···)"
        >
          <Codicon name="ellipsis" className="text-xs" />
        </button>
      </div>

      {/* 2. Content 区 (中间状态栏，横向自适应铺展) */}
      <div className="flex flex-1 items-center gap-1.5 min-w-0 px-2 overflow-x-auto no-scrollbar">
        {/* 1. 命令中心 ⌘ */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors"
          title={sb.commandPalette}
        >
          <span className="font-mono text-xs font-semibold">⌘</span>
        </button>

        {/* 2. 网关地址与下拉切换 */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setGatewayMenuOpen(!gatewayMenuOpen)}
            className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors font-mono text-[11px]"
            title={sb.gatewaySwitch}
          >
            <Codicon name="server" className="text-xs text-(--ui-accent) shrink-0" />
            <span className="truncate max-w-[130px]">{gatewayHost}</span>
            <Codicon name="chevron-down" className="text-[10px] opacity-70" />
          </button>

          {/* 网关菜单浮层 */}
          {gatewayMenuOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-64 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) p-2 shadow-(--shadow-nous) backdrop-blur-md z-50 text-xs">
              <div className="mb-2 border-b border-(--ui-stroke-quaternary) pb-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-(--ui-text-primary)">{sb.remoteGateway}</span>
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      isConnected ? 'bg-emerald-500' : isConnecting ? 'bg-amber-500' : 'bg-rose-500'
                    )}
                  />
                </div>
                <div className="mt-1 font-mono text-[11px] text-(--ui-text-tertiary) truncate">
                  {getGatewayBaseUrl() || gatewayHost}
                </div>
                <div className="mt-0.5 text-[10px] text-emerald-500 font-medium">
                  {isConnected ? sb.connectedWithPing(pingMs) : isConnecting ? sb.connecting : sb.offline}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setGatewayMenuOpen(false)
                    void reconnectGateway()
                  }}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-(--chrome-action-hover) text-(--ui-text-primary)"
                >
                  <Codicon name="refresh" className="text-xs text-(--ui-accent)" />
                  <span>{sb.reconnect}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGatewayMenuOpen(false)
                    onChangeGateway()
                  }}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-(--chrome-action-hover) text-(--ui-text-primary)"
                >
                  <Codicon name="plug" className="text-xs text-(--ui-accent)" />
                  <span>{sb.switchGateway}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. 网关 就绪 状态 */}
        <button
          type="button"
          onClick={() => void reconnectGateway()}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-(--chrome-action-hover) transition-colors shrink-0"
          title={`${sb.gateway}: ${isConnected ? sb.ready : isConnecting ? sb.connecting : sb.notReady}`}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              isConnected && 'bg-emerald-500',
              isConnecting && 'bg-amber-500 animate-pulse',
              !isConnected && !isConnecting && 'bg-rose-500'
            )}
          />
          <span className="text-[11px] text-(--ui-text-secondary)">{sb.gateway}</span>
          <span className={cn('text-[11px] font-medium', isConnected ? 'text-emerald-500' : 'text-(--ui-text-tertiary)')}>
            {isConnected ? sb.ready : isConnecting ? sb.connecting : sb.offline}
          </span>
        </button>

        {/* 4. 工作空间 / CWD */}
        <button
          type="button"
          onClick={handleCopyCwd}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors max-w-[160px] shrink-0"
          title={copiedCwd ? sb.copied : sb.workspaceTitle(currentCwd || projectName)}
        >
          <Codicon name="folder" className="text-xs text-(--ui-accent) shrink-0" />
          <span className="truncate font-mono text-[11px] text-(--ui-text-primary)">
            {copiedCwd ? sb.copied : projectName}
          </span>
        </button>

        {/* 5. 代理 */}
        <button
          type="button"
          onClick={onOpenConnections}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors shrink-0"
          title={sb.proxyTip}
        >
          <Codicon name="settings-gear" className="text-[11px] opacity-70" />
          <span>{sb.proxy}</span>
        </button>

        {/* 6. 排程 (Cron) */}
        <button
          type="button"
          onClick={onOpenCron}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors shrink-0"
          title={sb.cronTip}
        >
          <Codicon name="history" className="text-[11px] opacity-70" />
          <span>{sb.cron}</span>
        </button>

        {/* 7. Webhook */}
        <button
          type="button"
          onClick={onOpenWebhooks}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors shrink-0"
          title={sb.webhooksTip}
        >
          <Codicon name="link" className="text-[11px] opacity-70" />
          <span>{sb.webhooks}</span>
        </button>

        {/* 8. 智能体 (Agents) */}
        <button
          type="button"
          onClick={onOpenAgents}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors shrink-0"
          title={sb.agentsTip}
        >
          <Codicon name="hubot" className="text-[11px] opacity-70" />
          <span>{sb.agents}</span>
        </button>
      </div>

      {/* 3. Right 区 (右侧指标、审批模式、终端与版本信息) */}
      <div className="flex items-center gap-2 shrink-0 px-2 border-l border-(--ui-stroke-tertiary)">
        {/* 1. 上下文用量 (Gauge) */}
        <div
          className="font-mono text-[10px] text-(--ui-text-secondary) select-none tracking-tight shrink-0"
          title={sb.contextUsage}
        >
          21.5k/256k <span className="opacity-80">[██░░░░░░░░]</span> 8%
        </div>

        {/* 2. 会话持续时长 */}
        <div
          className="flex items-center gap-1 text-[10px] text-(--ui-text-secondary) select-none font-mono shrink-0"
          title={sb.session}
        >
          <span className="font-sans text-(--ui-text-tertiary)">{sb.session}</span>
          <span>{sessionDuration}</span>
        </div>

        {/* 3. 审批模式 (Approval Mode) 菜单 */}
        <div className="relative shrink-0" ref={approvalMenuRef}>
          <button
            type="button"
            onClick={() => setApprovalMenuOpen(!approvalMenuOpen)}
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors text-[11px]',
              approvalMenuOpen || approvalMode === 'off'
                ? 'bg-(--chrome-action-hover) text-(--ui-text-primary)'
                : 'hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) text-(--ui-text-secondary)'
            )}
            title={sb.approvalMode.ariaLabel(sb.approvalMode[approvalMode])}
          >
            <Codicon
              name="zap"
              className={cn(
                'text-[11px]',
                approvalMode === 'off' ? 'text-foreground' : 'text-foreground/80'
              )}
            />
            <span>{sb.approvalMode[approvalMode]}</span>
          </button>

          {/* 审批模式下拉菜单浮层 */}
          {approvalMenuOpen && (
            <div className="absolute bottom-full right-0 mb-1.5 w-72 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-card) p-1 text-xs text-(--ui-text-primary) shadow-xl backdrop-blur-md z-50">
              <div className="px-2 py-1 text-[11px] font-medium text-(--ui-text-tertiary)">
                {sb.approvalMode.title}
              </div>
              <div className="-mx-1 my-1 h-px bg-(--ui-stroke-tertiary)" />
              {(['manual', 'smart', 'off'] as const).map((mode) => {
                const isSelected = approvalMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      void setApprovalMode(mode)
                      setApprovalMenuOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      isSelected
                        ? 'bg-(--ui-control-active-background,rgba(255,255,255,0.08)) text-(--ui-text-primary)'
                        : 'hover:bg-(--chrome-action-hover) text-(--ui-text-primary)'
                    )}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium leading-none text-(--ui-text-primary)">
                        {sb.approvalMode[mode]}
                      </span>
                      <span className="text-[10px] leading-snug text-(--ui-text-tertiary)">
                        {sb.approvalMode[`${mode}Description` as const]}
                      </span>
                    </div>
                    {isSelected && (
                      <Codicon name="check" className="text-xs shrink-0 mt-0.5 text-(--ui-text-primary)" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 4. 工作区切换 */}
        {onToggleWorkspace && (
          <button
            type="button"
            onClick={onToggleWorkspace}
            className="flex size-5 items-center justify-center rounded hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors text-(--ui-text-secondary) shrink-0"
            title="工作区"
          >
            <Codicon name="layout-sidebar-right" className="text-xs" />
          </button>
        )}

        {/* 5. 远程终端入口 */}
        <button
          type="button"
          onClick={() => onFeature?.('terminal')}
          className="flex size-5 items-center justify-center rounded hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) transition-colors text-(--ui-text-secondary) shrink-0"
          title={sb.terminal}
        >
          <Codicon name="terminal" className="text-xs" />
        </button>

        {/* 6. 客户端版本 */}
        <span className="font-mono text-[10px] text-(--ui-text-tertiary) shrink-0" title={sb.clientVersion}>
          # {sb.clientVersion} {clientVersion}
        </span>

        {/* 7. 后端版本 Badge */}
        <div
          className="flex items-center gap-1 rounded bg-(--ui-accent) px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white shadow-xs cursor-default shrink-0"
          title={sb.backendVersion}
        >
          <span>#</span>
          <span>{sb.backendVersion} {backendVersion}</span>
        </div>
      </div>
    </footer>
  )
}
