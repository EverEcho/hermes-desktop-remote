import type { InputHTMLAttributes } from 'react'

import { cn } from './utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-[var(--btn-radius)] bg-(--ui-bg-input)',
        'border border-(--ui-stroke-secondary) shadow-[var(--dt-input-inset)]',
        'px-3 py-1.5 text-(--conversation-text-font-size) text-(--ui-text-primary)',
        'placeholder:text-(--ui-text-quaternary)',
        'outline-none transition-colors',
        'focus:border-(--ui-accent) focus:shadow-none',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}
