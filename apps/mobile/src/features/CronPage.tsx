import { useCallback, useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import { onGatewayEvent } from '@/gateway'
import type { CronJob } from '@/types/hermes'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface CronPageProps {
  open: boolean
  onClose: () => void
}

export function CronPage({ open, onClose }: CronPageProps) {
  const { t } = useI18n()
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<CronJob | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadJobs = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .getCronJobs()
      .then(setJobs)
      .catch(() => setError(t.cron.loadFailed))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    if (!open) {
      return
    }

    loadJobs()
  }, [open, loadJobs])

  /* Live refresh while open (Desktop cron.changed parity). */
  useEffect(() => {
    if (!open) {
      return
    }

    return onGatewayEvent(event => {
      if (event.type === 'cron.changed') {
        loadJobs()
      }
    })
  }, [open, loadJobs])

  const toggleJob = async (job: CronJob) => {
    try {
      const updated = job.enabled ? await api.pauseCronJob(job.id) : await api.resumeCronJob(job.id)
      setJobs(prev => prev.map(j => (j.id === updated.id ? updated : j)))
    } catch {
      // best effort
    }
  }

  const triggerJob = async (jobId: string) => {
    try {
      await api.triggerCronJob(jobId)
    } catch {
      // best effort
    }
  }

  const deleteJob = async (jobId: string) => {
    if (!window.confirm(t.cron.deleteConfirm)) {
      return
    }

    try {
      await api.deleteCronJob(jobId)
      setJobs(previous => previous.filter(job => job.id !== jobId))
    } catch {
      setError(t.cron.deleteFailed)
    }
  }

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={t.cron.title}>
      <div className="mb-3 flex justify-end">
        <button className="rounded-md bg-(--ui-accent) px-3 py-1.5 text-(--conversation-tool-font-size) text-white" onClick={() => setEditor('new')}>{t.cron.new}</button>
      </div>
      {loading && (
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">{t.common.loading}</p>
      )}

      {error && <p className="mb-3 text-(--conversation-caption-font-size) text-(--ui-red)">{error}</p>}

      {!loading && jobs.length === 0 && (
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">
          {t.cron.none}
        </p>
      )}

      <div>
        {jobs.map(job => (
          <div
            key={job.id}
            className="rounded-lg bg-(--ui-widget-surface-background) px-3.5 py-3 mb-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-(--conversation-text-font-size) font-medium text-(--ui-text-primary) truncate">
                  {job.name}
                </p>
                <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary) mt-0.5 font-mono">
                  {job.cron}
                </p>
              </div>
              <div
                className={cn(
                  'size-1.5 rounded-full ml-3 shrink-0',
                  job.enabled ? 'bg-(--ui-green)' : 'bg-(--ui-text-quaternary)'
                )}
              />
            </div>

            {job.description && (
              <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary) mt-2">
                {job.description}
              </p>
            )}

            <div className="flex gap-2 mt-3">
              <button
                className="text-(--conversation-tool-font-size) px-3 py-1.5 rounded-md bg-(--ui-bg-quaternary) text-(--ui-text-secondary) active:bg-(--ui-row-active-background)"
                onClick={() => void toggleJob(job)}
              >
                {job.enabled ? t.cron.pause : t.cron.resume}
              </button>
              <button
                className="text-(--conversation-tool-font-size) px-3 py-1.5 rounded-md bg-(--theme-secondary,#1a5cff14) text-(--ui-accent) active:opacity-75"
                onClick={() => void triggerJob(job.id)}
              >
                {t.cron.runNow}
              </button>
              <button className="ml-auto text-(--conversation-tool-font-size) text-(--ui-text-tertiary)" onClick={() => setEditor(job)}>{t.cron.edit}</button>
              <button className="text-(--conversation-tool-font-size) text-(--ui-red)" onClick={() => void deleteJob(job.id)}>{t.common.delete}</button>
            </div>
          </div>
        ))}
      </div>

      {editor && <CronEditor job={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={job => { setJobs(previous => editor === 'new' ? [...previous, job] : previous.map(row => row.id === job.id ? job : row)); setEditor(null) }} />}
    </ResponsiveSheet>
  )
}

function CronEditor({ job, onClose, onSaved }: { job?: CronJob; onClose: () => void; onSaved: (job: CronJob) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(job?.name ?? '')
  const [cron, setCron] = useState(job?.cron ?? '')
  const [prompt, setPrompt] = useState(job?.prompt ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = name.trim() && cron.trim() && prompt.trim()

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      const saved = job
        ? await api.updateCronJob(job.id, { name: name.trim(), cron: cron.trim(), prompt: prompt.trim() })
        : await api.createCronJob({ name: name.trim(), cron: cron.trim(), prompt: prompt.trim() })
      onSaved(saved)
    } catch {
      setError(t.cron.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center md:p-6" onClick={onClose}><div className="w-full md:w-auto md:min-w-[26rem] md:max-h-[80vh] md:overflow-y-auto rounded-t-xl md:rounded-xl bg-(--ui-bg-elevated) p-4 pb-[calc(1rem+var(--safe-area-bottom))]" onClick={event => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-(--ui-text-primary)">{job ? t.cron.editTitle : t.cron.newTitle}</h2><button className="text-xs text-(--ui-text-tertiary)" onClick={onClose}>{t.common.close}</button></div><EditorField label={t.cron.name} value={name} onChange={setName} placeholder={t.cron.namePlaceholder} /><EditorField label={t.cron.schedule} value={cron} onChange={setCron} placeholder="0 9 * * 1-5" /><label className="mb-3 block"><span className="mb-1 block text-(--conversation-tool-font-size) text-(--ui-text-secondary)">{t.cron.prompt}</span><textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={4} className="w-full resize-none rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-accent)" placeholder={t.cron.promptPlaceholder} /></label>{error && <p className="mb-3 text-xs text-(--ui-red)">{error}</p>}<button disabled={!valid || saving} onClick={() => void save()} className="w-full rounded-md bg-(--ui-accent) px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{saving ? t.common.saving : t.cron.saveCron}</button></div></div>
}

function EditorField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="mb-3 block"><span className="mb-1 block text-(--conversation-tool-font-size) text-(--ui-text-secondary)">{label}</span><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-xs text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent)" /></label>
}
