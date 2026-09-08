import { useState } from 'react'

import { createNewSession, sendMessage } from '@/sessions/store'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface ProjectSessionPageProps {
  onClose: () => void
  open: boolean
}

/** Creates a project-scoped session on the connected Gateway. `cwd` is never
 * inspected locally; the remote Gateway remains the only authority for paths,
 * repositories, and command execution. */
export function ProjectSessionPage({ onClose, open }: ProjectSessionPageProps) {
  const [cwd, setCwd] = useState('')
  const [prompt, setPrompt] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    const path = cwd.trim()
    if (!path || working) return
    setWorking(true)
    setError('')
    try {
      const id = await createNewSession(path)
      if (!id) throw new Error('The Gateway could not create a session for this folder.')
      if (prompt.trim()) await sendMessage(prompt.trim())
      setCwd('')
      setPrompt('')
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create project session')
    } finally {
      setWorking(false)
    }
  }

  return (
    <ResponsiveSheet compact onClose={onClose} open={open} title="New project session">
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-(--ui-text-tertiary)">Enter a folder on the connected Gateway. The folder is validated remotely; it is not a path on this device.</p>
        <label className="block text-xs font-medium text-(--ui-text-primary)">Gateway working directory<input autoFocus className="webhook-input mt-1.5" disabled={working} onChange={event => setCwd(event.target.value)} placeholder="/workspace/my-project" value={cwd} /></label>
        <label className="block text-xs font-medium text-(--ui-text-primary)">Starting message <span className="font-normal text-(--ui-text-quaternary)">(optional)</span><textarea className="webhook-input mt-1.5 min-h-20 resize-y" disabled={working} onChange={event => setPrompt(event.target.value)} placeholder="What should Hermes work on?" value={prompt} /></label>
        {error ? <div className="rounded-md bg-(--ui-red)/10 px-2.5 py-2 text-xs text-(--ui-red)">{error}</div> : null}
        <div className="flex justify-end gap-2"><Button disabled={working} onClick={onClose} size="sm" variant="secondary">Cancel</Button><Button disabled={!cwd.trim() || working} onClick={() => void create()} size="sm">{working ? 'Creating…' : 'Create project session'}</Button></div>
      </div>
    </ResponsiveSheet>
  )
}
