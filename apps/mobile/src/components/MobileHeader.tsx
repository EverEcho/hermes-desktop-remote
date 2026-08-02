import { MobileChromeButton } from '@/ui/primitives'
import { cn } from '@/ui/utils'
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
      {onBack ? (
        <MobileChromeButton onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </MobileChromeButton>
      ) : onMenuPress ? (
        <MobileChromeButton onClick={onMenuPress}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </MobileChromeButton>
      ) : null}

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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </MobileChromeButton>
      )}

      {onSettingsPress && (
        <MobileChromeButton onClick={onSettingsPress}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
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
        {state === 'auth-required' ? 'Sign in' : 'Retry'}
      </span>
    </button>
  )
}
