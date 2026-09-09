import type { ButtonHTMLAttributes } from 'react'
import { cn } from './utils'

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onChange?: (checked: boolean) => void
  size?: 'sm' | 'md'
}

export function Switch({
  checked,
  onChange,
  disabled,
  size = 'md',
  className,
  ...rest
}: SwitchProps) {
  const isSm = size === 'sm'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={e => {
        rest.onClick?.(e)
        if (!e.defaultPrevented) {
          onChange?.(!checked)
        }
      }}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--ui-bg-card)',
        isSm ? 'h-5 w-9' : 'h-6 w-11',
        checked
          ? 'bg-(--theme-primary)'
          : 'bg-black/15 hover:bg-black/20 dark:bg-white/20 dark:hover:bg-white/25',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        className
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25),0_1px_2px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-in-out',
          isSm ? 'size-4' : 'size-5',
          checked
            ? isSm ? 'translate-x-4' : 'translate-x-5'
            : 'translate-x-0'
        )}
      />
    </button>
  )
}
