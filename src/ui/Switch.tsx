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
        isSm ? 'h-5 w-9' : 'h-6 w-11',
        checked ? 'bg-(--theme-primary)' : 'bg-(--ui-bg-quaternary)',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        className
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out',
          isSm ? 'size-4' : 'size-5',
          checked
            ? isSm ? 'translate-x-4' : 'translate-x-5'
            : 'translate-x-0'
        )}
      />
    </button>
  )
}
