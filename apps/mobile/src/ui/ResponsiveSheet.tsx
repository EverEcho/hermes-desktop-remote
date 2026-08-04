import { useEffect, type ReactNode } from 'react'

import { MobileSheet } from './BottomSheet'
import { cn } from './utils'
import { useIsDesktop } from './useMediaQuery'

interface ResponsiveSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Small centered dialog on md+ instead of the full-size panel. */
  compact?: boolean
}

/** Bottom sheet on phones; centered dialog (desktop-settings style) on md+. */
export function ResponsiveSheet({ open, onClose, title, children, compact }: ResponsiveSheetProps) {
  const isDesktop = useIsDesktop()

  useEffect(() => {
    if (!open || !isDesktop) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [open, isDesktop, onClose])

  if (!isDesktop) {
    return (
      <MobileSheet fullScreen onClose={onClose} open={open} title={title}>
        {children}
      </MobileSheet>
    )
  }

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          'relative flex flex-col overflow-hidden rounded-xl border border-(--stroke-nous) shadow-(--shadow-nous) bg-(--ui-bg-elevated)',
          compact ? 'max-h-[80vh] w-full max-w-md' : 'h-[min(54rem,100%)] w-[min(66rem,100%)]'
        )}
      >
        <div className={cn('flex shrink-0 items-center justify-between border-b border-(--ui-stroke-tertiary) py-3', compact ? 'px-4' : 'px-6')}>
          <span className="text-sm font-semibold text-(--ui-text-primary)">{title}</span>
          <button
            className="grid size-7 place-items-center rounded-[4px] text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)"
            onClick={onClose}
            type="button"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="size-3.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={cn('flex-1 overflow-y-auto no-scrollbar py-4', compact ? 'px-4' : 'px-6')}>{children}</div>
      </div>
    </div>
  )
}
