import { useEffect, useMemo, useRef, useState } from 'react'

import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'

export interface DesktopCommand {
  description?: string
  icon: string
  id: string
  label: string
  shortcut?: string
  run: () => void
}

interface DesktopCommandPaletteProps {
  commands: DesktopCommand[]
  onClose: () => void
  open: boolean
}

/** Desktop-only command surface. It deliberately contains presentation and
 * keyboard handling only; every command delegates to the shared remote
 * Gateway/session actions supplied by the shell. */
export function DesktopCommandPalette({ commands, onClose, open }: DesktopCommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return commands

    return commands.filter(command =>
      `${command.label} ${command.description ?? ''}`.toLowerCase().includes(normalized)
    )
  }, [commands, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (selectedIndex >= matches.length) setSelectedIndex(Math.max(0, matches.length - 1))
  }, [matches.length, selectedIndex])

  if (!open) return null

  const run = (command: DesktopCommand | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <div
      aria-label="Command palette"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/15 pt-[15vh] backdrop-blur-[1px]"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) shadow-(--shadow-nous)">
        <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2.5">
          <Codicon className="text-(--ui-text-quaternary)" name="search" />
          <input
            aria-label="Search commands"
            className="min-w-0 flex-1 bg-transparent text-sm text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
            onChange={event => { setQuery(event.target.value); setSelectedIndex(0) }}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedIndex(current => Math.min(current + 1, Math.max(0, matches.length - 1)))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex(current => Math.max(current - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                run(matches[selectedIndex])
              }
            }}
            placeholder="Search commands…"
            ref={inputRef}
            value={query}
          />
          <kbd className="rounded border border-(--ui-stroke-tertiary) px-1.5 py-0.5 text-[0.65rem] text-(--ui-text-quaternary)">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5 no-scrollbar">
          {matches.length ? matches.map((command, index) => (
            <button
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
                index === selectedIndex
                  ? 'bg-(--ui-row-active-background) text-(--ui-text-primary)'
                  : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'
              )}
              key={command.id}
              onClick={() => run(command)}
              onMouseEnter={() => setSelectedIndex(index)}
              type="button"
            >
              <Codicon className="text-sm text-(--ui-text-tertiary)" name={command.icon} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{command.label}</span>
                {command.description ? <span className="block truncate pt-0.5 text-[0.68rem] text-(--ui-text-quaternary)">{command.description}</span> : null}
              </span>
              {command.shortcut ? <kbd className="text-[0.65rem] text-(--ui-text-quaternary)">{command.shortcut}</kbd> : null}
            </button>
          )) : (
            <div className="px-3 py-8 text-center text-xs text-(--ui-text-quaternary)">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  )
}
