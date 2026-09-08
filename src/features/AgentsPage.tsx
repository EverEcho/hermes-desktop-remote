import { useMemo } from 'react'
import { useStore } from '@nanostores/react'

import { $subagentsBySession, type SubagentProgress } from '@/gateway'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface AgentsPageProps {
  onClose: () => void
  onOpenSession: (sessionId: string) => void
  open: boolean
}

function statusTone(status: SubagentProgress['status']): string {
  if (status === 'completed') return 'text-emerald-600'
  if (status === 'failed' || status === 'interrupted') return 'text-(--ui-red)'
  return 'text-(--ui-accent)'
}

/** A read-only view over `subagent.*` Gateway events. Delegation remains
 * Gateway-owned, so this works equally on a browser, mobile WebView, and Tauri. */
export function AgentsPage({ onClose, onOpenSession, open }: AgentsPageProps) {
  const map = useStore($subagentsBySession)
  const agents = useMemo(() => [...map.values()].flat().sort((a, b) => b.updatedAt - a.updatedAt), [map])
  const active = agents.filter(item => item.status === 'queued' || item.status === 'running').length

  return (
    <ResponsiveSheet onClose={onClose} open={open} title="Agents">
      <div className="space-y-3">
        <p className="text-xs text-(--ui-text-tertiary)">{agents.length ? `${agents.length} delegated task${agents.length === 1 ? '' : 's'} · ${active} active` : 'Subagents will appear here while a Gateway session delegates work.'}</p>
        {!agents.length ? <div className="rounded-lg border border-dashed border-(--ui-stroke-tertiary) px-3 py-8 text-center text-xs text-(--ui-text-quaternary)">No delegated tasks received yet.</div> : null}
        <div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)">
          {agents.map(agent => (
            <button className="w-full border-b border-(--ui-stroke-tertiary) px-3 py-3 text-left last:border-b-0 hover:bg-(--chrome-action-hover)" key={agent.id} onClick={() => onOpenSession(agent.sessionId)} type="button">
              <span className="flex gap-2 text-xs"><span className="min-w-0 flex-1 truncate font-medium text-(--ui-text-primary)">{agent.goal}</span><span className={`shrink-0 ${statusTone(agent.status)}`}>{agent.status}</span></span>
              {agent.tool ? <span className="mt-1 block truncate font-mono text-[0.68rem] text-(--ui-text-tertiary)">{agent.tool}</span> : null}
              {agent.summary ? <span className="mt-1 block line-clamp-2 text-[0.7rem] text-(--ui-text-quaternary)">{agent.summary}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </ResponsiveSheet>
  )
}
