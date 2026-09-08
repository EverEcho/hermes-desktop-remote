import { useCallback, useEffect, useMemo, useState } from 'react'
import { createCronTriggerController } from '@/shared'

import * as api from '@/gateway/api'
import { onGatewayEvent } from '@/gateway'
import type {
  AutomationBlueprint,
  AutomationBlueprintField,
  CronDeliveryTarget,
  CronJob,
  ModelOptionProvider,
  SessionInfo
} from '@/types/hermes'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Codicon } from '@/ui/Codicon'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface CronPageProps {
  open: boolean
  onClose: () => void
  onOpenSession?: (id: string) => void
}

const DEFAULT_DELIVER = 'local'
const CUSTOM_TEMPLATE = 'custom'

const SCHEDULE_OPTIONS = [
  { expr: '0 9 * * *', value: 'daily' },
  { expr: '0 9 * * 1-5', value: 'weekdays' },
  { expr: '0 9 * * 1', value: 'weekly' },
  { expr: '0 9 1 * *', value: 'monthly' },
  { expr: '0 * * * *', value: 'hourly' },
  { expr: '*/15 * * * *', value: 'every-15-minutes' },
  { value: 'custom' }
] as const

type SchedulePreset = (typeof SCHEDULE_OPTIONS)[number]['value']

function scheduleOptionForExpr(expr: string): SchedulePreset {
  const normalized = expr.trim().replace(/\s+/g, ' ')
  const match = SCHEDULE_OPTIONS.find(opt => 'expr' in opt && opt.expr === normalized)
  return match ? (match.value as SchedulePreset) : 'custom'
}

function jobState(job: CronJob): string {
  const state = typeof job.state === 'string' ? job.state.trim() : ''
  return state || (job.enabled === false ? 'disabled' : 'scheduled')
}

function jobTitle(job: CronJob): string {
  const pick = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const clip = (v: string) => (v.length > 60 ? `${v.slice(0, 60)}…` : v)
  return pick(job.name) || clip(pick(job.prompt)) || clip(pick(job.script)) || job.id || 'Cron job'
}

function formatTime(iso?: null | string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.valueOf()) ? iso : date.toLocaleString()
}

function formatRunTime(seconds?: null | number): string {
  if (!seconds) return '—'
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString()
}

function parseCronDeliveryTargets(value: string): string[] {
  const targets = value
    .split(',')
    .map(target => target.trim())
    .filter(Boolean)
  return targets.length > 0 ? [...new Set(targets)] : ['local']
}

function toggleCronDeliveryTarget(value: string, target: string, checked: boolean): string {
  const targets = parseCronDeliveryTargets(value)
  if (checked) {
    return targets.includes(target) ? targets.join(',') : [...targets, target].join(',')
  }
  if (!targets.includes(target) || targets.length === 1) {
    return targets.join(',')
  }
  return targets.filter(candidate => candidate !== target).join(',')
}

function initialBlueprintValues(blueprint: AutomationBlueprint): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of blueprint.fields) {
    const seeded = field.default ?? ''
    out[field.name] = field.name === 'deliver' && (seeded === '' || seeded === 'origin') ? DEFAULT_DELIVER : seeded
  }
  return out
}

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create'; blueprintKey?: string }
  | { mode: 'edit'; job: CronJob }

export function CronPage({ open, onClose, onOpenSession }: CronPageProps) {
  const { t } = useI18n()
  const c = t.cron
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [blueprints, setBlueprints] = useState<AutomationBlueprint[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const [error, setError] = useState<string | null>(null)
  const [runningJobs, setRunningJobs] = useState<Record<string, boolean>>({})

  const triggerController = useMemo(
    () => createCronTriggerController((key, running) => setRunningJobs(current => ({ ...current, [key]: running }))),
    []
  )

  const loadData = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.getCronJobs().catch(() => []),
      api.getAutomationBlueprints().catch(() => [])
    ])
      .then(([jobsResult, blueprintsResult]) => {
        setJobs(jobsResult)
        setBlueprints(blueprintsResult)
        if (jobsResult.length > 0) {
          setSelectedJobId(prev => (prev && jobsResult.some(j => j.id === prev) ? prev : jobsResult[0].id))
        } else {
          setSelectedJobId(null)
        }
      })
      .catch(() => setError(c.loadFailed))
      .finally(() => setLoading(false))
  }, [c.loadFailed])

  useEffect(() => {
    if (!open) return
    loadData()
  }, [open, loadData])

  useEffect(() => {
    if (!open) return
    return onGatewayEvent(event => {
      if (event.type === 'cron.changed') {
        loadData()
      }
    })
  }, [open, loadData])

  const toggleJob = async (job: CronJob) => {
    try {
      const updated = job.enabled ? await api.pauseCronJob(job.id) : await api.resumeCronJob(job.id)
      setJobs(prev => prev.map(j => (j.id === updated.id ? updated : j)))
    } catch {
      setError(c.saveFailed)
    }
  }

  const triggerJob = async (jobId: string) => {
    try {
      const result = await triggerController.run(jobId, () => api.triggerCronJob(jobId))
      if (!result.started) return
      if (result.value) {
        loadData()
      }
    } catch {
      setError(c.saveFailed)
    }
  }

  const deleteJob = async (job: CronJob) => {
    if (!window.confirm(c.deleteConfirm)) return
    try {
      await api.deleteCronJob(job.id)
      setJobs(prev => prev.filter(j => j.id !== job.id))
      if (selectedJobId === job.id) {
        setSelectedJobId(null)
      }
    } catch {
      setError(c.deleteFailed)
    }
  }

  const visibleJobs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter(job =>
      [jobTitle(job), job.prompt, job.schedule_display, job.schedule?.expr, job.deliver]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    )
  }, [jobs, query])

  const visibleBlueprints = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return blueprints
    return blueprints.filter(item =>
      `${item.title} ${item.description}`.toLowerCase().includes(q)
    )
  }, [blueprints, query])

  const selectedJob = useMemo(
    () => jobs.find(job => job.id === selectedJobId) ?? visibleJobs[0] ?? null,
    [jobs, visibleJobs, selectedJobId]
  )

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title={c.title}
      subtitle={c.count(jobs.length)}
      bodyClassName="p-0 flex flex-col min-h-0 overflow-hidden"
      actions={
        <Button
          size="sm"
          variant="default"
          onClick={() => setEditor({ mode: 'create' })}
          className="h-7 text-xs"
        >
          <Codicon name="add" size="0.85rem" />
          <span>{c.new}</span>
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row overflow-hidden">
        {/* Left List Rail */}
        <div className="flex w-full shrink-0 flex-col md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary)/30 min-h-0">
          {/* Search bar */}
          <div className="p-2.5 border-b border-(--ui-stroke-tertiary) shrink-0">
            <div className="relative flex items-center">
              <Codicon
                name="search"
                className="absolute left-2.5 text-(--ui-text-quaternary) pointer-events-none"
                size="0.85rem"
              />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={c.search}
                className="h-8 pl-8 pr-7 text-xs"
              />
              {query ? (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2 text-(--ui-text-quaternary) hover:text-(--ui-text-primary)"
                  type="button"
                >
                  <Codicon name="close" size="0.75rem" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Master List: Jobs & Blueprints */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2 space-y-3 divide-y divide-(--ui-stroke-tertiary)/40">
            {/* 1. Jobs List */}
            <div>
              <div className="flex items-center justify-between px-2 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-(--ui-text-quaternary)">
                <span>{c.title}</span>
                <span className="tabular-nums font-normal">{visibleJobs.length}</span>
              </div>

              {loading && jobs.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-(--ui-text-quaternary)">
                  <Codicon name="loading" size="0.9rem" spinning />
                  <span>{c.loading}</span>
                </div>
              ) : visibleJobs.length === 0 ? (
                <div className="py-4 px-2 text-center text-xs text-(--ui-text-quaternary)">
                  {query.trim() ? c.emptyTitleSearch : c.emptyTitleNew}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {visibleJobs.map(job => {
                    const isSelected = selectedJob?.id === job.id
                    const isRunning = Boolean(runningJobs[job.id])
                    const isPaused = jobState(job) === 'paused'

                    return (
                      <div
                        key={job.id}
                        onClick={() => setSelectedJobId(job.id)}
                        className={cn(
                          'group/row relative flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-xs transition-colors',
                          isSelected
                            ? 'bg-(--ui-row-active-background) text-(--ui-text-primary)'
                            : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)'
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className={cn(
                              'size-2 shrink-0 rounded-full',
                              isRunning
                                ? 'bg-(--ui-accent) animate-pulse'
                                : isPaused
                                  ? 'bg-amber-500'
                                  : job.enabled
                                    ? 'bg-(--ui-green)'
                                    : 'bg-(--ui-text-quaternary)'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-(--ui-text-primary)">
                              {jobTitle(job)}
                            </p>
                            <p className="truncate font-mono text-[0.68rem] text-(--ui-text-tertiary)">
                              {job.schedule_display || job.schedule?.expr || job.cron || '—'}
                            </p>
                          </div>
                        </div>

                        {/* Hover Quick Actions */}
                        <div className="ml-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
                          <button
                            title={c.edit}
                            onClick={e => {
                              e.stopPropagation()
                              setEditor({ mode: 'edit', job })
                            }}
                            className="rounded p-1 text-(--ui-text-tertiary) hover:bg-(--ui-bg-quaternary) hover:text-(--ui-text-primary)"
                            type="button"
                          >
                            <Codicon name="edit" size="0.75rem" />
                          </button>
                          <button
                            title={t.common.delete}
                            onClick={e => {
                              e.stopPropagation()
                              void deleteJob(job)
                            }}
                            className="rounded p-1 text-(--ui-text-tertiary) hover:bg-(--ui-red)/10 hover:text-(--ui-red)"
                            type="button"
                          >
                            <Codicon name="trash" size="0.75rem" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 2. Blueprints Section (Automation Templates) */}
            {visibleBlueprints.length > 0 && (
              <div className="pt-3">
                <div className="flex items-center justify-between px-2 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-(--ui-text-quaternary)">
                  <span className="flex items-center gap-1">
                    <Codicon name="rocket" size="0.75rem" className="text-(--ui-accent)" />
                    <span>{c.blueprints.tab}</span>
                  </span>
                  <span className="tabular-nums font-normal">{visibleBlueprints.length}</span>
                </div>
                <div className="space-y-0.5">
                  {visibleBlueprints.map(item => (
                    <button
                      key={item.key}
                      onClick={() => setEditor({ mode: 'create', blueprintKey: item.key })}
                      className="group/blueprint flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-(--chrome-action-hover)"
                      type="button"
                    >
                      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-(--theme-secondary,#1a5cff14) text-(--ui-accent)">
                        <Codicon name="rocket" size="0.75rem" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-(--ui-text-primary) group-hover/blueprint:text-(--ui-accent)">
                          {item.title}
                        </p>
                        <p className="line-clamp-1 text-[0.68rem] text-(--ui-text-tertiary)">
                          {item.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Detail Pane */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-(--ui-red)/10 px-3.5 py-2.5 text-xs text-(--ui-red)">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-xs hover:underline">
                {t.common.close}
              </button>
            </div>
          )}

          {selectedJob ? (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-(--ui-stroke-tertiary) pb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="truncate text-base font-semibold text-(--ui-text-primary)">
                      {jobTitle(selectedJob)}
                    </h3>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium',
                        selectedJob.enabled
                          ? 'bg-(--ui-green)/10 text-(--ui-green)'
                          : 'bg-(--ui-text-quaternary)/20 text-(--ui-text-tertiary)'
                      )}
                    >
                      {(c.states as Record<string, string>)[jobState(selectedJob)] ?? jobState(selectedJob)}
                    </span>
                  </div>
                  {selectedJob.description && (
                    <p className="mt-1 text-xs text-(--ui-text-tertiary)">{selectedJob.description}</p>
                  )}
                </div>

                {/* Primary Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void toggleJob(selectedJob)}
                    className="h-8 text-xs"
                  >
                    <Codicon name={selectedJob.enabled ? 'debug-pause' : 'play'} size="0.8rem" />
                    <span>{selectedJob.enabled ? c.pause : c.resume}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={Boolean(runningJobs[selectedJob.id])}
                    onClick={() => void triggerJob(selectedJob.id)}
                    className="h-8 text-xs"
                  >
                    <Codicon
                      name={runningJobs[selectedJob.id] ? 'loading' : 'zap'}
                      size="0.8rem"
                      spinning={Boolean(runningJobs[selectedJob.id])}
                    />
                    <span>{c.runNow}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditor({ mode: 'edit', job: selectedJob })}
                    className="h-8 text-xs"
                  >
                    <Codicon name="edit" size="0.8rem" />
                    <span>{c.edit}</span>
                  </Button>
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-1 gap-3 rounded-lg bg-(--ui-bg-card) border border-(--ui-stroke-tertiary) p-3.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <span className="block text-[0.68rem] text-(--ui-text-quaternary)">{c.frequencyLabel}</span>
                  <span className="mt-0.5 block font-medium text-(--ui-text-primary)">
                    {selectedJob.schedule_display || selectedJob.schedule?.expr || selectedJob.cron || '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-[0.68rem] text-(--ui-text-quaternary)">{c.last}</span>
                  <span className="mt-0.5 block font-medium text-(--ui-text-primary)">
                    {formatTime(selectedJob.last_run_at)}
                  </span>
                </div>
                <div>
                  <span className="block text-[0.68rem] text-(--ui-text-quaternary)">{c.next}</span>
                  <span className="mt-0.5 block font-medium text-(--ui-text-primary)">
                    {formatTime(selectedJob.next_run_at)}
                  </span>
                </div>
                <div>
                  <span className="block text-[0.68rem] text-(--ui-text-quaternary)">{c.deliverLabel}</span>
                  <span className="mt-0.5 block font-medium text-(--ui-text-primary)">
                    {(c.deliveryLabels as Record<string, string>)[selectedJob.deliver ?? 'local'] ?? selectedJob.deliver ?? c.deliveryLabels.local}
                  </span>
                </div>
              </div>

              {/* Prompt Monospace Block */}
              {selectedJob.prompt ? (
                <div>
                  <h4 className="mb-1.5 text-xs font-semibold text-(--ui-text-secondary)">{c.prompt}</h4>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) p-3 text-xs font-mono leading-relaxed text-(--ui-text-primary)">
                    {selectedJob.prompt}
                  </pre>
                </div>
              ) : null}

              {/* Runs History */}
              <CronJobRunsSection
                jobId={selectedJob.id}
                onOpenSession={id => {
                  onClose()
                  onOpenSession?.(id)
                }}
              />
            </div>
          ) : (
            <div className="flex min-h-[22rem] flex-1 flex-col items-center justify-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-(--ui-bg-quaternary) text-(--ui-text-tertiary)">
                <Codicon name="watch" size="1.5rem" />
              </div>
              <h3 className="text-sm font-semibold text-(--ui-text-primary)">{c.emptyTitleNew}</h3>
              <p className="mt-1 max-w-sm text-xs text-(--ui-text-tertiary)">{c.emptyDescNew}</p>
              <Button
                size="sm"
                variant="default"
                onClick={() => setEditor({ mode: 'create' })}
                className="mt-4 text-xs"
              >
                <Codicon name="add" size="0.85rem" />
                <span>{c.newCron}</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Unified Editor Dialog */}
      {editor.mode !== 'closed' && (
        <CronEditorDialog
          editor={editor}
          blueprints={blueprints}
          onClose={() => setEditor({ mode: 'closed' })}
          onCreated={job => {
            setJobs(prev => [job, ...prev])
            setSelectedJobId(job.id)
            setEditor({ mode: 'closed' })
          }}
          onUpdated={job => {
            setJobs(prev => prev.map(j => (j.id === job.id ? job : j)))
            setSelectedJobId(job.id)
            setEditor({ mode: 'closed' })
          }}
        />
      )}
    </ResponsiveSheet>
  )
}

function CronJobRunsSection({
  jobId,
  onOpenSession
}: {
  jobId: string
  onOpenSession?: (id: string) => void
}) {
  const { t } = useI18n()
  const c = t.cron
  const [runs, setRuns] = useState<SessionInfo[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .getCronJobRuns(jobId)
      .then(result => {
        if (active) setRuns(result)
      })
      .catch(() => {
        if (active) setRuns([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [jobId])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-(--ui-text-secondary)">
          {c.runHistory} {runs && runs.length > 0 ? `· ${runs.length}` : ''}
        </h4>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-(--ui-text-quaternary)">
          <Codicon name="loading" size="0.85rem" spinning />
          <span>{c.loading}</span>
        </div>
      ) : !runs || runs.length === 0 ? (
        <div className="py-3 text-xs text-(--ui-text-quaternary)">{c.noRuns}</div>
      ) : (
        <div className="space-y-1">
          {runs.map(run => (
            <button
              key={run.id}
              onClick={() => onOpenSession?.(run.id)}
              className="row-hover flex w-full items-center justify-between rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) px-3 py-2 text-left text-xs transition-colors hover:border-(--ui-stroke-secondary)"
              type="button"
            >
              <span className="truncate font-medium text-(--ui-text-primary)">
                {run.title?.trim() || run.preview?.trim() || run.id}
              </span>
              <span className="ml-3 shrink-0 text-[0.68rem] text-(--ui-text-quaternary) tabular-nums">
                {formatRunTime(run.last_active || run.started_at)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DeliverCheckboxes({
  targets,
  value,
  onChange
}: {
  targets: CronDeliveryTarget[]
  value: string
  onChange: (next: string) => void
}) {
  const { t } = useI18n()
  const c = t.cron
  const selected = parseCronDeliveryTargets(value)
  const knownIds = new Set(targets.map(target => target.id))

  const options = [
    ...targets,
    ...selected
      .filter(target => !knownIds.has(target))
      .map(target => ({ home_env_var: null, home_target_set: true, id: target, name: target }))
  ]

  return (
    <div className="grid gap-2 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary)/30 px-3 py-2.5">
      {options.map((target, index) => {
        const checked = selected.includes(target.id)
        const checkboxId = `deliver-${target.id}-${index}`
        const label =
          target.id === 'local'
            ? c.deliveryLabels.local
            : (c.deliveryLabels as Record<string, string>)[target.id] ?? target.name

        return (
          <label
            key={target.id}
            htmlFor={checkboxId}
            className="flex cursor-pointer select-none items-center gap-2 text-xs text-(--ui-text-primary)"
          >
            <input
              type="checkbox"
              id={checkboxId}
              checked={checked}
              onChange={e => onChange(toggleCronDeliveryTarget(value, target.id, e.target.checked))}
              className="size-3.5 rounded accent-(--ui-accent)"
            />
            <span>
              {label}
              {target.id !== 'local' && !target.home_target_set
                ? ` — ${c.deliverNeedsHomeChannel}`
                : ''}
            </span>
          </label>
        )
      })}
    </div>
  )
}

function BlueprintSlotControl({
  field,
  id,
  value,
  onChange
}: {
  field: AutomationBlueprintField
  id: string
  value: string
  onChange: (next: string) => void
}) {
  if (field.type === 'enum' || field.type === 'weekdays') {
    return (
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-1.5 text-xs text-(--ui-text-primary) focus:border-(--ui-accent) focus:outline-none"
      >
        <option value="">请选择</option>
        {field.options.map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'time') {
    return (
      <input
        id={id}
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-1.5 text-xs text-(--ui-text-primary) focus:border-(--ui-accent) focus:outline-none"
      />
    )
  }

  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={field.help || field.label}
      className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-1.5 text-xs text-(--ui-text-primary) placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent) focus:outline-none"
    />
  )
}

interface CronEditorDialogProps {
  editor: EditorState
  blueprints: AutomationBlueprint[]
  onClose: () => void
  onCreated: (job: CronJob) => void
  onUpdated: (job: CronJob) => void
}

function CronEditorDialog({
  editor,
  blueprints,
  onClose,
  onCreated,
  onUpdated
}: CronEditorDialogProps) {
  const { t } = useI18n()
  const c = t.cron
  const isEdit = editor.mode === 'edit'
  const initialJob = isEdit ? editor.job : null

  // Template selection
  const [templateChoice, setTemplateChoice] = useState<string>(() => {
    if (editor.mode === 'create' && editor.blueprintKey) {
      return editor.blueprintKey
    }
    return CUSTOM_TEMPLATE
  })

  // Blueprint state
  const activeBlueprint = useMemo(
    () => (templateChoice === CUSTOM_TEMPLATE ? null : blueprints.find(b => b.key === templateChoice) ?? null),
    [blueprints, templateChoice]
  )
  const [slotValues, setSlotValues] = useState<Record<string, string>>({})

  // Custom cron state
  const [name, setName] = useState(initialJob?.name ?? '')
  const [prompt, setPrompt] = useState(initialJob?.prompt ?? '')
  const [schedule, setSchedule] = useState(initialJob?.schedule?.expr ?? initialJob?.cron ?? '0 9 * * *')
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>(() =>
    initialJob ? scheduleOptionForExpr(initialJob.schedule?.expr ?? initialJob.cron ?? '') : 'daily'
  )
  const [deliver, setDeliver] = useState(initialJob?.deliver ?? DEFAULT_DELIVER)
  const [modelChoice, setModelChoice] = useState(() =>
    initialJob && initialJob.model ? `${initialJob.provider ?? ''}:${initialJob.model}` : ''
  )

  // Remote choices
  const [deliveryTargets, setDeliveryTargets] = useState<CronDeliveryTarget[]>([])
  const [modelProviders, setModelProviders] = useState<ModelOptionProvider[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.getCronDeliveryTargets().then(targets => {
      if (active) setDeliveryTargets(targets)
    }).catch(() => undefined)
    void api.getModelOptions().then(result => {
      if (active) setModelProviders(result.providers ?? [])
    }).catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (activeBlueprint) {
      setSlotValues(initialBlueprintValues(activeBlueprint))
    }
  }, [activeBlueprint])

  const handlePresetChange = (preset: SchedulePreset) => {
    setSchedulePreset(preset)
    const match = SCHEDULE_OPTIONS.find(opt => opt.value === preset)
    if (match && 'expr' in match) {
      setSchedule(match.expr)
    }
  }

  const handleBlueprintSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeBlueprint) return
    setSaving(true)
    setError(null)
    try {
      const job = await api.instantiateAutomationBlueprint(activeBlueprint.key, slotValues)
      onCreated(job)
    } catch {
      setError(c.blueprints.failedLoad || '无法创建自动化任务。')
    } finally {
      setSaving(false)
    }
  }

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || !schedule.trim()) return
    setSaving(true)
    setError(null)

    const [providerSlug, modelName] = modelChoice.includes(':')
      ? [modelChoice.slice(0, modelChoice.indexOf(':')), modelChoice.slice(modelChoice.indexOf(':') + 1)]
      : ['', '']

    try {
      if (isEdit && initialJob) {
        const updated = await api.updateCronJob(initialJob.id, {
          name: name.trim() || undefined,
          prompt: prompt.trim(),
          schedule: schedule.trim(),
          deliver: deliver || DEFAULT_DELIVER,
          model: modelName || null,
          provider: providerSlug || null
        })
        onUpdated(updated)
      } else {
        const created = await api.createCronJob({
          name: name.trim() || undefined,
          prompt: prompt.trim(),
          schedule: schedule.trim(),
          deliver: deliver || DEFAULT_DELIVER,
          ...(modelName ? { model: modelName, provider: providerSlug || undefined } : {})
        })
        onCreated(created)
      }
    } catch {
      setError(c.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-(--stroke-nous) shadow-2xl bg-(--ui-bg-elevated)">
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-(--ui-stroke-tertiary) px-5 py-3.5">
          <h3 className="text-sm font-semibold text-(--ui-text-primary)">
            {isEdit ? c.editTitle : c.newTitle}
          </h3>
          <button
            onClick={onClose}
            className="grid size-7 place-items-center rounded-[4px] text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)"
            type="button"
          >
            <Codicon name="close" size="1rem" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Start from template selector (only in create mode) */}
          {!isEdit && (
            <div>
              <label htmlFor="cron-template-choice" className="mb-1.5 block text-xs font-medium text-(--ui-text-secondary)">
                {c.startFromLabel}
              </label>
              <select
                id="cron-template-choice"
                value={templateChoice}
                onChange={e => setTemplateChoice(e.target.value)}
                className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-3 py-2 text-xs text-(--ui-text-primary) focus:border-(--ui-accent) focus:outline-none"
              >
                <option value={CUSTOM_TEMPLATE}>{c.customTemplate}</option>
                {blueprints.length > 0 && (
                  <optgroup label={c.blueprints.tab}>
                    {blueprints.map(b => (
                      <option key={b.key} value={b.key}>
                        {b.title}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-(--ui-red)/10 px-3 py-2 text-xs text-(--ui-red)">
              {error}
            </div>
          )}

          {/* Form branch: Blueprint vs Custom */}
          {activeBlueprint ? (
            <form onSubmit={handleBlueprintSubmit} className="space-y-4">
              {/* Blueprint Description Banner */}
              <div className="rounded-lg bg-(--theme-secondary,#1a5cff14) border border-(--ui-accent)/20 p-3 text-xs">
                <p className="font-semibold text-(--ui-text-primary) mb-0.5">{activeBlueprint.title}</p>
                <p className="text-(--ui-text-secondary) leading-relaxed">{activeBlueprint.description}</p>
              </div>

              {/* Dynamic Blueprint fields */}
              {activeBlueprint.fields.map(field => {
                const fieldId = `bp-${activeBlueprint.key}-${field.name}`
                return (
                  <div key={field.name} className="space-y-1">
                    <label htmlFor={fieldId} className="block text-xs font-medium text-(--ui-text-secondary)">
                      {field.label} {field.optional ? `(${c.optional})` : ''}
                    </label>
                    {field.name === 'deliver' ? (
                      <DeliverCheckboxes
                        targets={deliveryTargets}
                        value={slotValues[field.name] ?? DEFAULT_DELIVER}
                        onChange={next => setSlotValues(prev => ({ ...prev, [field.name]: next }))}
                      />
                    ) : (
                      <BlueprintSlotControl
                        field={field}
                        id={fieldId}
                        value={slotValues[field.name] ?? ''}
                        onChange={next => setSlotValues(prev => ({ ...prev, [field.name]: next }))}
                      />
                    )}
                    {field.help && field.name !== 'deliver' ? (
                      <p className="text-[0.68rem] text-(--ui-text-quaternary)">{field.help}</p>
                    ) : null}
                  </div>
                )
              })}

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-(--ui-stroke-tertiary)">
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" variant="default" disabled={saving}>
                  {saving ? c.blueprints.scheduling : c.blueprints.scheduleIt}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              {/* Job Name */}
              <div>
                <label htmlFor="cron-name" className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">
                  {c.name} <span className="text-(--ui-text-quaternary)">({c.optional})</span>
                </label>
                <Input
                  id="cron-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={c.namePlaceholder}
                  className="text-xs"
                />
              </div>

              {/* Job Prompt */}
              <div>
                <label htmlFor="cron-prompt" className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">
                  {c.prompt} <span className="text-(--ui-red)">*</span>
                </label>
                <textarea
                  id="cron-prompt"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={c.promptPlaceholder}
                  rows={4}
                  required
                  className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) p-2.5 font-mono text-xs text-(--ui-text-primary) placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent) focus:outline-none"
                />
              </div>

              {/* Frequency preset */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="cron-frequency" className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">
                    {c.frequencyLabel}
                  </label>
                  <select
                    id="cron-frequency"
                    value={schedulePreset}
                    onChange={e => handlePresetChange(e.target.value as SchedulePreset)}
                    className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-1.5 text-xs text-(--ui-text-primary) focus:border-(--ui-accent) focus:outline-none"
                  >
                    {SCHEDULE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {c.scheduleLabels[opt.value]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Model override */}
                <div>
                  <label htmlFor="cron-model" className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">
                    {c.modelLabel} <span className="text-(--ui-text-quaternary)">({c.optional})</span>
                  </label>
                  <select
                    id="cron-model"
                    value={modelChoice}
                    onChange={e => setModelChoice(e.target.value)}
                    className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-1.5 text-xs text-(--ui-text-primary) focus:border-(--ui-accent) focus:outline-none"
                  >
                    <option value="">{c.modelDefault}</option>
                    {modelProviders.map(provider => (
                      <optgroup key={provider.slug} label={provider.name}>
                        {(provider.models ?? []).map(model => (
                          <option key={`${provider.slug}:${model}`} value={`${provider.slug}:${model}`}>
                            {model}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Schedule input */}
              {schedulePreset === 'custom' ? (
                <div>
                  <label htmlFor="cron-schedule" className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">
                    {c.customScheduleLabel}
                  </label>
                  <Input
                    id="cron-schedule"
                    value={schedule}
                    onChange={e => setSchedule(e.target.value)}
                    placeholder={c.customPlaceholder}
                    className="font-mono text-xs"
                  />
                  <p className="mt-1 text-[0.68rem] text-(--ui-text-quaternary)">{c.customHint}</p>
                </div>
              ) : (
                <div className="rounded-md bg-(--ui-bg-secondary)/40 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="text-(--ui-text-secondary)">{c.scheduleHints[schedulePreset]}</span>
                  <span className="font-mono text-(--ui-text-tertiary)">{schedule}</span>
                </div>
              )}

              {/* Delivery Targets */}
              <div>
                <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">
                  {c.deliverLabel}
                </label>
                <DeliverCheckboxes targets={deliveryTargets} value={deliver} onChange={setDeliver} />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-(--ui-stroke-tertiary)">
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" variant="default" disabled={saving || !prompt.trim()}>
                  {saving ? t.common.saving : isEdit ? c.saveChanges : c.createAction}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
