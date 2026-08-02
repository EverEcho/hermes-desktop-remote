import { cn } from './utils'

export interface ActionSheetAction {
  id: string
  label: string
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative mx-2 mb-[calc(0.5rem+var(--safe-area-bottom))] rounded-2xl border border-(--stroke-nous) shadow-(--shadow-nous) bg-[color-mix(in_srgb,var(--ui-bg-card)_92%,transparent)] backdrop-blur-xl overflow-hidden">
        {title && (
          <div className="px-4 py-3 text-center text-(--conversation-tool-font-size) text-(--ui-text-tertiary) border-b border-(--ui-stroke-tertiary)">
            {title}
          </div>
        )}

        {actions.map(action => (
          <button
            key={action.id}
            disabled={action.disabled}
            className={cn(
              'w-full px-4 py-3.5 text-center text-[1rem] border-b border-(--ui-stroke-tertiary) last:border-0',
              'active:bg-(--ui-row-active-background) transition-colors',
              action.destructive ? 'text-(--ui-red)' : 'text-(--ui-accent)',
              action.disabled && 'opacity-40'
            )}
            onClick={() => {
              onAction(action.id)
              onClose()
            }}
          >
            {action.label}
          </button>
        ))}

        <button
          className="w-full px-4 py-3.5 text-center text-[1rem] font-semibold text-(--ui-text-secondary) active:bg-(--ui-row-active-background)"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
