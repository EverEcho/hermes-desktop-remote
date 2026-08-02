import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './utils'

export function MobileChromeButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={cn(
        'size-8 grid place-items-center rounded-[4px] shrink-0',
        'text-(--ui-text-secondary) active:bg-(--chrome-action-hover) active:text-(--ui-text-primary)',
        'transition-colors duration-100',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function MobileListRow({
  selected = false,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; children: ReactNode }) {
  return (
    <button
      className={cn(
        'w-full text-left min-h-[1.625rem] px-2 pr-1 py-0.5',
        'flex items-center gap-1.5 rounded-md',
        'active:bg-(--ui-row-active-background) transition-colors duration-100',
        selected && 'bg-(--ui-row-active-background)',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function MobileSurface({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[var(--btn-radius)] bg-(--ui-widget-surface-background) px-3.5 py-3',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
