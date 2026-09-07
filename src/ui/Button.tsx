import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './utils'

type Variant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'text'
type Size = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm'

const VARIANTS: Record<Variant, string> = {
  default: 'bg-(--theme-primary) text-white active:bg-(--theme-primary)/90',
  destructive: 'bg-(--ui-red)/60 text-white active:bg-(--ui-red)/70',
  outline:
    'bg-transparent text-(--ui-text-primary) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ui-stroke-secondary)_50%,transparent)] active:bg-(--chrome-action-hover)',
  secondary: 'bg-(--ui-bg-quaternary) text-(--ui-text-primary) active:bg-(--chrome-action-hover)',
  ghost: 'text-(--ui-text-secondary) active:bg-(--chrome-action-hover) active:text-(--ui-text-primary)',
  text: 'text-(--ui-text-tertiary) active:text-(--ui-text-primary)'
}

const SIZES: Record<Size, string> = {
  default: 'px-3 py-1.5 text-xs',
  sm: 'px-2.5 py-1 text-xs',
  lg: 'px-5 py-2 text-sm',
  icon: 'size-9 p-0',
  'icon-sm': 'size-8 p-0'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({ variant = 'default', size = 'default', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5',
        'rounded-[var(--btn-radius)] font-medium whitespace-nowrap leading-4',
        'shadow-none transition-colors duration-100 outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-3.5',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5z" />
    </svg>
  )
}
