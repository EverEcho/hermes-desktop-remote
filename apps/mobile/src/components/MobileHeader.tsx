import { MobileChromeButton } from '@/ui/primitives'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'
import type { MobileConnectionState } from '@/gateway'

interface MobileHeaderProps {
  title?: string
  subtitle?: string
  onMenuPress?: () => void
  onSettingsPress?: () => void
  onBack?: () => void
  onWorkspacePress?: () => void
  connectionState: MobileConnectionState
  onRetry?: () => void
}

export function MobileHeader({
  title,
  subtitle,
  onMenuPress,
  onSettingsPress,
  onBack,
  onWorkspacePress,
  connectionState,
  onRetry
}: MobileHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-center gap-1 px-2 shrink-0',
        'bg-(--ui-bg-chrome) border-b border-(--ui-stroke-tertiary)',
        'pt-[var(--safe-area-top)]'
      )}
      style={{ height: 'calc(2.5rem + var(--safe-area-top))' }}
    >
      {onBack && (
        <MobileChromeButton onClick={onBack}>
          <Codicon name="chevron-left" className="text-base" />
        </MobileChromeButton>
      )}
      {onMenuPress && (
        <MobileChromeButton onClick={onMenuPress} className="md:hidden">
          <Codicon name="menu" className="text-base" />
        </MobileChromeButton>
      )}

      <div className="flex-1 min-w-0 leading-tight px-1">
        <span className="text-xs font-semibold text-(--ui-text-primary) truncate block">
          {title ?? 'RHermes'}
        </span>
        {subtitle && (
          <span className="text-[0.6875rem] text-(--ui-text-tertiary) truncate block">
            {subtitle}
          </span>
        )}
      </div>

      <ConnectionIndicator state={connectionState} onRetry={onRetry} />

      {onWorkspacePress && (
        <MobileChromeButton onClick={onWorkspacePress}>
          <Codicon name="folder" className="text-sm" />
        </MobileChromeButton>
      )}

      {onSettingsPress && (
        <MobileChromeButton onClick={onSettingsPress}>
          <Codicon name="settings-gear" className="text-sm" />
        </MobileChromeButton>
      )}
    </header>
  )
}

function ConnectionIndicator({
  state,
  onRetry
}: {
  state: MobileConnectionState
  onRetry?: () => void
}) {
  const { t } = useI18n()

  if (state === 'open') {
    return <div className="size-1.5 rounded-full bg-(--ui-accent) mx-1" />
  }

  if (state === 'connecting' || state === 'reconnecting') {
    return <div className="size-1.5 rounded-full bg-(--ui-accent) opacity-70 animate-pulse mx-1" />
  }

  return (
    <button onClick={onRetry} className="flex items-center gap-1 h-8 px-1.5 rounded-[4px] active:bg-(--chrome-action-hover)">
      <div
        className={cn(
          'size-1.5 rounded-full',
          state === 'auth-required' ? 'bg-(--ui-yellow)' : 'bg-(--ui-red)'
        )}
      />
      <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
        {state === 'auth-required' ? t.header.signIn : t.header.retry}
      </span>
    </button>
  )
}
