import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'

import { cn } from '@/ui/utils'

export function clampPanelWidth(width: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(min, max), Math.max(min, width)))
}

interface ResizableDividerProps {
  ariaLabel: string
  defaultWidth: number
  max: number
  min: number
  onResize: (width: number) => void
  side: 'left' | 'right'
  width: number
}

/** Keyboard-accessible desktop sash. The adjacent panel owns width state so
 * it can be persisted and constrained against the remaining chat column. */
export function ResizableDivider({
  ariaLabel,
  defaultWidth,
  max,
  min,
  onResize,
  side,
  width
}: ResizableDividerProps) {
  const [dragging, setDragging] = useState(false)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => dragCleanupRef.current?.(), [])

  const resize = (next: number) => onResize(clampPanelWidth(next, min, max))

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    setDragging(true)
    document.documentElement.classList.add('is-resizing-panels')

    const onMove = (move: globalThis.PointerEvent) => {
      const delta = move.clientX - startX
      resize(startWidth + (side === 'left' ? delta : -delta))
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      document.documentElement.classList.remove('is-resizing-panels')
      setDragging(false)
      dragCleanupRef.current = null
    }
    const onUp = () => cleanup()

    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    dragCleanupRef.current = cleanup
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = side === 'left' ? 1 : -1
    const step = event.shiftKey ? 32 : 8
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      resize(width - step * direction)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      resize(width + step * direction)
    } else if (event.key === 'Home') {
      event.preventDefault()
      resize(min)
    } else if (event.key === 'End') {
      event.preventDefault()
      resize(max)
    }
  }

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemax={Math.round(max)}
      aria-valuemin={min}
      aria-valuenow={Math.round(width)}
      className={cn('desktop-panel-sash group/panel-sash', dragging && 'is-dragging')}
      onDoubleClick={() => resize(defaultWidth)}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
    >
      <span aria-hidden="true" />
    </div>
  )
}
