import { cn } from './utils'

export interface ActionSheetAction {
  id: string
  label: string
  icon?: React.ReactNode
  destructive?: boolean
  disabled?: boolean
}

interface ActionSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  actions: ActionSheetAction[]
  onAction: (id: string) => void
}

export function ActionSheet({ open, onClose, title, actions, onAction }: ActionSheetProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-3 mb-[calc(0.5rem+var(--safe-area-bottom))] rounded-xl border border-(--stroke-nous) shadow-(--shadow-nous) bg-(--ui-bg-elevated) overflow-hidden">
        {title && (
          <div className="px-4 py-2.5 text-center text-(--conversation-tool-font-size) text-(--ui-text-tertiary) border-b border-(--ui-stroke-tertiary)">
            {title}
          </div>
        )}

        {actions.map(action => (
          <button
            key={action.id}
            disabled={action.disabled}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 border-b border-(--ui-stroke-quaternary) last:border-0',
              'active:bg-(--ui-row-active-background) transition-colors duration-100',
              action.destructive ? 'text-(--ui-red)' : 'text-(--ui-text-primary)',
              action.disabled && 'opacity-40'
            )}
            onClick={() => {
              onAction(action.id)
              onClose()
            }}
          >
            {action.icon && <span className="size-4 shrink-0 grid place-items-center">{action.icon}</span>}
            <span className="text-sm">{action.label}</span>
          </button>
        ))}

        <button
          className="w-full px-4 py-3 text-center text-sm font-medium text-(--ui-text-secondary) active:bg-(--ui-row-active-background)"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
