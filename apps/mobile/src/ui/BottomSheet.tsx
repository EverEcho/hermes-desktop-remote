import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from './utils'

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  fullScreen?: boolean
}

export function MobileSheet({ open, onClose, title, children, fullScreen }: MobileSheetProps) {
  const [dragY, setDragY] = useState(0)
  const startY = useRef(0)
  const dragging = useRef(false)

  useEffect(() => {
    if (!open) {
      setDragY(0)
    }
  }, [open])

  if (!open) {
    return null
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    dragging.current = true
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) {
      return
    }

    const delta = e.touches[0].clientY - startY.current

    if (delta > 0) {
      setDragY(delta)
    }
  }

  const handleTouchEnd = () => {
    dragging.current = false

    if (dragY > 120) {
      onClose()
    }

    setDragY(0)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          'relative flex flex-col overflow-hidden',
          'rounded-t-xl border border-(--stroke-nous) shadow-(--shadow-nous)',
          'bg-(--ui-bg-elevated)',
          'transition-transform duration-150 ease-out',
          fullScreen ? 'h-[94vh] max-h-[94vh]' : 'max-h-[85vh]'
        )}
        style={{ transform: `translateY(${dragY}px)` }}
      >
        <div
          className="flex items-center justify-center py-2 cursor-grab active:cursor-grabbing shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-8 h-[3px] rounded-full bg-(--ui-stroke-tertiary)" />
        </div>

        {title && (
          <div className="px-4 pb-2 pt-1 flex items-center justify-between border-b border-(--ui-stroke-tertiary) shrink-0">
            <span className="text-xs font-semibold text-(--ui-text-secondary)">{title}</span>
            <button
              className="size-6 grid place-items-center rounded-[4px] text-(--ui-text-tertiary) active:bg-(--chrome-action-hover)"
              onClick={onClose}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 pb-[calc(1rem+var(--safe-area-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}

export { MobileSheet as BottomSheet }
