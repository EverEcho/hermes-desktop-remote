import { useEffect, type ReactNode } from 'react'

import { cn } from './utils'

interface DrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function Drawer({ open, onClose, children }: DrawerProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const handleBack = (e: PopStateEvent) => {
      e.preventDefault()
      onClose()
    }

    window.history.pushState({ drawer: true }, '')
    window.addEventListener('popstate', handleBack)

    return () => {
      window.removeEventListener('popstate', handleBack)
    }
  }, [open, onClose])

  return (
    <div
      className={cn(
        'fixed inset-0 z-40 transition-opacity duration-150',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[82vw] max-w-[320px]',
          'bg-(--ui-bg-sidebar) border-r border-(--ui-stroke-tertiary)',
          'flex flex-col',
          'transition-transform duration-150 ease-out',
          'pt-[var(--safe-area-top)] pb-[var(--safe-area-bottom)]',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {children}
      </div>
    </div>
  )
}
