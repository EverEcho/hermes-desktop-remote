import { type ReactNode } from 'react'

import { cn } from '@/ui/utils'

import { CheckIcon, type IconComponent } from './icons'

export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-(--conversation-caption-font-size) text-(--ui-text-tertiary)', className)}>{children}</p>
  )
}

export function SectionHeading({ icon: Icon, title, action }: { icon?: IconComponent; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-4 pb-2 first:pt-1">
      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-(--ui-text-secondary)">
        {Icon && <Icon className="size-4 shrink-0 text-(--ui-text-tertiary)" />}
        <span className="truncate">{title}</span>
      </span>
      {action}
    </div>
  )
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-(--ui-bg-quaternary) px-1.5 py-0.5 text-[0.625rem] leading-3 text-(--ui-text-tertiary)">
      {children}
    </span>
  )
}

export function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      aria-checked={checked}
      aria-role="switch"
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full transition-colors',
        checked ? 'bg-(--theme-primary)' : 'bg-(--ui-bg-quaternary)',
        disabled && 'opacity-40 pointer-events-none'
      )}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span
        className={cn(
          'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

interface RowProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  below?: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}

export function Row({ title, description, action, below, onClick, disabled, className }: RowProps) {
  const Tag = onClick ? 'button' : 'div'

  return (
    <div className={cn('rounded-lg', disabled && 'opacity-50 pointer-events-none', className)}>
      <Tag
        className={cn('flex w-full items-center justify-between gap-3 py-2.5 min-h-[2.75rem] text-left', onClick && 'active:bg-(--ui-row-active-background) rounded-lg px-1')}
        onClick={onClick}
        type={onClick ? 'button' : undefined}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-(--conversation-text-font-size) text-(--ui-text-primary)">{title}</div>
          {description && <div className="text-(--conversation-caption-font-size) text-(--ui-text-tertiary) break-words">{description}</div>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </Tag>
      {below && <div className="pb-2">{below}</div>}
    </div>
  )
}

export function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <Row
      action={<Toggle checked={checked} disabled={disabled} onChange={onChange} />}
      description={description}
      title={label}
    />
  )
}

export interface PickerOption {
  value: string
  label: string
  description?: string
}

interface PickerSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  options: readonly PickerOption[]
  value: string
  onPick: (value: string) => void
}

export function PickerSheet({ open, onClose, title, options, value, onPick }: PickerSheetProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end md:justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[70vh] md:max-h-[60vh] md:w-96 flex flex-col overflow-hidden rounded-t-xl md:rounded-xl border border-(--stroke-nous) shadow-(--shadow-nous) bg-(--ui-bg-elevated)">
        {title && (
          <div className="px-4 py-2.5 text-center text-(--conversation-tool-font-size) text-(--ui-text-tertiary) border-b border-(--ui-stroke-tertiary) shrink-0">
            {title}
          </div>
        )}
        <div className="overflow-y-auto no-scrollbar pb-[calc(0.5rem+var(--safe-area-bottom))]">
          {options.map(option => (
            <button
              className="w-full flex items-center gap-3 px-4 py-3 active:bg-(--ui-row-active-background) text-left"
              key={option.value || '__none__'}
              onClick={() => {
                onPick(option.value)
                onClose()
              }}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-(--ui-text-primary) truncate">{option.label}</div>
                {option.description && (
                  <div className="text-(--conversation-caption-font-size) text-(--ui-text-tertiary) truncate">{option.description}</div>
                )}
              </div>
              {option.value === value && <CheckIcon className="size-4 shrink-0 text-(--theme-primary)" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) {
    return null
  }

  return <div className="mt-2 text-(--conversation-caption-font-size) text-(--ui-red)">{children}</div>
}

export function WarningBanner({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-(--conversation-caption-font-size) text-amber-600 dark:text-amber-300">
      <span className="grow min-w-0">{children}</span>
      {action}
    </div>
  )
}

export function ValueButton({ children, onClick, placeholder }: { children: ReactNode; onClick: () => void; placeholder?: string }) {
  return (
    <button
      className={cn(
        'flex min-w-0 max-w-full items-center gap-1 rounded-[var(--btn-radius)] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-2.5 py-1.5 text-(--conversation-text-font-size)',
        children ? 'text-(--ui-text-primary)' : 'text-(--ui-text-quaternary)'
      )}
      onClick={onClick}
      type="button"
    >
      <span className="truncate font-mono">{children || placeholder}</span>
      <svg className="size-3 shrink-0 text-(--ui-text-quaternary)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  )
}
