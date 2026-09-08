import { useStore } from '@nanostores/react'
import type { SessionInfo } from '@/types/hermes'
import { $sessionTitle } from '@/sessions/store'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'

interface DesktopSessionTabsProps {
  activeSessionId: string | null
  onClose: (id: string) => void
  onCloseOthers?: (id: string) => void
  onCloseAll?: () => void
  onSelect: (id: string, profile?: string) => void
  sessions: SessionInfo[]
  tabIds: string[]
}

/** A lightweight desktop tab strip. Tabs are navigation history, not local
 * runtimes: selecting one still resumes it through the remote Gateway. */
export function DesktopSessionTabs({
  activeSessionId,
  onClose,
  onCloseOthers,
  onCloseAll,
  onSelect,
  sessions,
  tabIds
}: DesktopSessionTabsProps) {
  const currentTitle = useStore($sessionTitle)
  if (!tabIds.length) return null
  const byId = new Map(sessions.map(session => [session._lineage_root_id ?? session.id, session]))

  return (
    <div className="flex h-8 shrink-0 items-end gap-px overflow-x-auto border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-chrome) px-1.5 no-scrollbar">
      {tabIds.map(id => {
        const session = byId.get(id)
        const active = id === activeSessionId
        const title = session?.title?.trim() || session?.preview?.trim() || (active ? currentTitle?.trim() : null) || 'Untitled conversation'
        return (
          <div
            className={cn(
              'group flex min-w-28 max-w-56 items-center gap-1 rounded-t-md border border-b-0 px-2 py-1 text-xs select-none',
              active ? 'border-(--ui-stroke-tertiary) bg-(--ui-bg-card) text-(--ui-text-primary)' : 'border-transparent text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)'
            )}
            key={id}
            onAuxClick={event => {
              if (event.button === 1) {
                event.preventDefault()
                onClose(id)
              }
            }}
          >
            <button className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(id, session?.profile)} title={title} type="button">
              {title}
            </button>
            <button
              aria-label={`Close ${title}`}
              className="grid size-4 shrink-0 place-items-center rounded text-(--ui-text-quaternary) opacity-0 hover:bg-(--ui-bg-quaternary) hover:text-(--ui-text-primary) group-hover:opacity-100 focus:opacity-100"
              onClick={event => { event.stopPropagation(); onClose(id) }}
              type="button"
            >
              <Codicon name="close" className="text-[0.7rem]" />
            </button>
          </div>
        )
      })}
      {tabIds.length > 1 && (
        <div className="ml-auto flex items-center gap-1 pb-1 pl-2">
          {activeSessionId && onCloseOthers ? (
            <button
              className="rounded px-1.5 py-0.5 text-[0.625rem] text-(--ui-text-quaternary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)"
              onClick={() => onCloseOthers(activeSessionId)}
              title="Close other tabs"
              type="button"
            >
              Close others
            </button>
          ) : null}
          {onCloseAll ? (
            <button
              className="rounded px-1.5 py-0.5 text-[0.625rem] text-(--ui-text-quaternary) hover:bg-(--chrome-action-hover) hover:text-(--ui-red)"
              onClick={onCloseAll}
              title="Close all tabs"
              type="button"
            >
              Close all
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
