import { useEffect, useState, type MouseEvent } from 'react'
import { useStore } from '@nanostores/react'

import { $authState, switchConnection, switchProfile } from '@/auth'
import { loadRemoteGatewayRegistry, type StoredConnection } from '@/auth/token-store'
import * as api from '@/gateway/api'
import type { MobileConnectionState } from '@/gateway'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'
import { isTauriPlatform } from '@/native'

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

  // `data-tauri-drag-region` is sufficient with some title-bar styles, but
  // WebKit's hit testing is inconsistent for overlay windows. Start the drag
  // explicitly on a bare title-bar press; interactive controls stay exempt.
  const startDragging = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !isTauriPlatform()) return
    const target = event.target as HTMLElement
    if (target.closest('button, select, input, textarea, a, [data-no-drag]')) return
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
      .catch(() => undefined)
  }

  return (
    <header className="desktop-titlebar" data-tauri-drag-region onMouseDown={startDragging}>
      <div className="desktop-titlebar-traffic-spacer" data-tauri-drag-region />
      <TitlebarButton
        active={props.leftSidebarVisible}
        icon={props.leftSidebarVisible ? 'layout-sidebar-left' : 'layout-sidebar-left-off'}
        label={props.leftSidebarVisible ? t.desktop.hideLeftSidebar : t.desktop.showLeftSidebar}
        onClick={props.onToggleLeftSidebar}
        shortcut="Meta+B Control+B"
      />

      <GatewayConnectionPicker />
      <GatewayProfilePicker />

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
        shortcut="Meta+Shift+B Control+Shift+B"
      />
      <TitlebarButton icon="settings-gear" label={t.sidebar.settings} onClick={props.onOpenSettings} />
    </header>
  )
}

function GatewayConnectionPicker() {
  const authState = useStore($authState)
  const [connections, setConnections] = useState<StoredConnection[]>([])

  useEffect(() => {
    let cancelled = false

    void loadRemoteGatewayRegistry().then(registry => {
      if (cancelled) return
      setConnections(registry.connections.map(connection => ({
        authMode: connection.authMode,
        gatewayUrl: connection.baseUrl,
        id: connection.id,
        profile: connection.profile
      })))
    }).catch(() => {
      if (!cancelled) setConnections([])
    })

    return () => {
      cancelled = true
    }
  }, [authState])

  if (connections.length < 2 || authState.status !== 'authenticated') return null

  return (
    <select
      aria-label="Gateway connection"
      className="desktop-titlebar-connection-select"
      onChange={event => void switchConnection(event.target.value)}
      value={authState.connectionId}
    >
      {connections.map(connection => (
        <option key={connection.id} value={connection.id}>
          {new URL(connection.gatewayUrl).host}
        </option>
      ))}
    </select>
  )
}

function GatewayProfilePicker() {
  const authState = useStore($authState)
  const [profiles, setProfiles] = useState<string[]>([])

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      setProfiles([])
      return
    }

    let cancelled = false
    void api.getProfiles().then(response => {
      if (!cancelled) setProfiles(response.profiles.map(profile => profile.name).filter(Boolean))
    }).catch(() => {
      if (!cancelled) setProfiles([])
    })

    return () => {
      cancelled = true
    }
  }, [authState])

  if (authState.status !== 'authenticated' || profiles.length < 2) return null

  return (
    <select
      aria-label="Gateway profile"
      className="desktop-titlebar-profile-select"
      onChange={event => void switchProfile(event.target.value)}
      value={authState.profile}
    >
      {profiles.map(profile => <option key={profile} value={profile}>{profile}</option>)}
    </select>
  )
}

function TitlebarButton({
  active,
  disabled,
  icon,
  label,
  onClick,
  shortcut
}: {
  active?: boolean
  disabled?: boolean
  icon: string
  label: string
  onClick: () => void
  shortcut?: string
}) {
  return (
    <button
      aria-label={label}
      aria-keyshortcuts={shortcut}
      className={cn('desktop-titlebar-button', active && 'is-active')}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      <Codicon name={icon} className="text-[0.78rem]" />
    </button>
  )
}
