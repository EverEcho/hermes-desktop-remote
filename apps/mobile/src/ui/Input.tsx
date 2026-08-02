import type { InputHTMLAttributes } from 'react'

import { cn } from './utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'desktop-input-chrome w-full min-w-0 rounded-[var(--btn-radius)] border',
        'px-2.5 py-1.5 text-xs leading-4 text-(--ui-text-primary)',
        'placeholder:text-(--ui-text-quaternary)',
        'disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      {...props}
    />
  )
}
