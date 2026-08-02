import { useEffect, useState, type ReactNode } from 'react'

import { cn } from './utils'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  fullScreen?: boolean
}

export function BottomSheet({ open, onClose, title, children, fullScreen }: BottomSheetProps) {
  const [dragY, setDragY] = useState(0)
  const startY = { current: 0 }
  const dragging = { current: false }

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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={cn(
          'relative flex flex-col overflow-hidden',
          'rounded-t-2xl border border-(--stroke-nous) shadow-(--shadow-nous)',
          'bg-[color-mix(in_srgb,var(--ui-bg-card)_92%,transparent)] backdrop-blur-xl',
          'transition-transform duration-200 ease-out',
          fullScreen ? 'h-[94vh] max-h-[94vh]' : 'max-h-[85vh]'
        )}
        style={{ transform: `translateY(${dragY}px)` }}
      >
        <div
          className="flex items-center justify-center py-2.5 cursor-grab active:cursor-grabbing shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-9 h-1 rounded-full bg-(--ui-text-quaternary)" />
        </div>

        {title && (
          <div className="px-4 pb-2 text-(--conversation-caption-font-size) font-semibold text-(--ui-text-secondary) shrink-0">
            {title}
          </div>
        )}

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-[calc(1.25rem+var(--safe-area-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}
