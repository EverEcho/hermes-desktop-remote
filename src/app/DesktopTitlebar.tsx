import type { MobileConnectionState } from '@/gateway'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface DesktopTitlebarProps {
  connectionState: MobileConnectionState
  leftSidebarVisible: boolean
  rightSidebarVisible: boolean
  rightSidebarAvailable: boolean
  title: string
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
  onOpenSettings: () => void
  onOpenWorkspace: () => void
  onRetry: () => void
}

export function DesktopTitlebar(props: DesktopTitlebarProps) {
  const { t } = useI18n()
  const disconnected = props.connectionState !== 'open'

  return (
    <header className="desktop-titlebar" data-tauri-drag-region>
      <div className="desktop-titlebar-traffic-spacer" data-tauri-drag-region />
      <TitlebarButton
        active={props.leftSidebarVisible}
        icon={props.leftSidebarVisible ? 'layout-sidebar-left' : 'layout-sidebar-left-off'}
        label={props.leftSidebarVisible ? t.desktop.hideLeftSidebar : t.desktop.showLeftSidebar}
        onClick={props.onToggleLeftSidebar}
      />

      <div className="desktop-titlebar-title" data-tauri-drag-region>
        <span className="truncate">{props.title}</span>
      </div>

      <button
        className="desktop-titlebar-connection"
        onClick={disconnected ? props.onRetry : undefined}
        title={disconnected ? t.desktop.reconnectGateway : t.desktop.gatewayConnected}
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            props.connectionState === 'open'
              ? 'bg-(--ui-green)'
              : props.connectionState === 'connecting' || props.connectionState === 'reconnecting'
                ? 'animate-pulse bg-(--ui-yellow)'
                : 'bg-(--ui-red)'
          )}
        />
      </button>
      <TitlebarButton
        icon="folder-opened"
        label={t.desktop.openWorkspace}
        disabled={!props.rightSidebarAvailable}
        onClick={props.onOpenWorkspace}
      />
      <TitlebarButton
        active={props.rightSidebarVisible}
        icon={props.rightSidebarVisible ? 'layout-sidebar-right' : 'layout-sidebar-right-off'}
        label={props.rightSidebarVisible ? t.desktop.hideFileList : t.desktop.showFileList}
        disabled={!props.rightSidebarAvailable}
        onClick={props.onToggleRightSidebar}
      />
      <TitlebarButton icon="settings-gear" label={t.sidebar.settings} onClick={props.onOpenSettings} />
    </header>
  )
}

function TitlebarButton({
  active,
  disabled,
  icon,
  label,
  onClick
}: {
  active?: boolean
  disabled?: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      className={cn('desktop-titlebar-button', active && 'is-active')}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      <Codicon name={icon} className="text-[0.78rem]" />
    </button>
  )
}
