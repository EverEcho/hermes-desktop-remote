import { useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { CronJob } from '@/types/hermes'
import { BottomSheet } from '@/ui/BottomSheet'
import { cn } from '@/ui/utils'

interface CronPageProps {
  open: boolean
  onClose: () => void
}

export function CronPage({ open, onClose }: CronPageProps) {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setLoading(true)
    api
      .getCronJobs()
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

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

  return (
    <BottomSheet open={open} onClose={onClose} title="Cron Jobs" fullScreen>
      {loading && (
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">Loading…</p>
      )}

      {!loading && jobs.length === 0 && (
        <p className="text-(--conversation-caption-font-size) text-(--ui-text-quaternary) py-4">
          No cron jobs configured
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
                {job.enabled ? 'Pause' : 'Resume'}
              </button>
              <button
                className="text-(--conversation-tool-font-size) px-3 py-1.5 rounded-md bg-(--theme-secondary,#1a5cff14) text-(--ui-accent) active:opacity-75"
                onClick={() => void triggerJob(job.id)}
              >
                Run now
              </button>
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}
