import { useCallback, useEffect, useMemo, useState } from 'react'
import { createCronTriggerController } from '@/shared'

import * as api from '@/gateway/api'
import { onGatewayEvent } from '@/gateway'
import type { AutomationBlueprint, CronJob, ModelOptionProvider, SessionInfo } from '@/types/hermes'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'
import { cn } from '@/ui/utils'
import { useI18n } from '@/i18n'

interface CronPageProps {
  open: boolean
  onClose: () => void
  onOpenSession?: (id: string) => void
}

export function CronPage({ open, onClose, onOpenSession }: CronPageProps) {
  const { t } = useI18n()
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<CronJob | 'new' | null>(null)
  const [blueprints, setBlueprints] = useState<AutomationBlueprint[] | null>(null)
  const [blueprintEditor, setBlueprintEditor] = useState<AutomationBlueprint | null>(null)
  const [runsJob, setRunsJob] = useState<CronJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runningJobs, setRunningJobs] = useState<Record<string, boolean>>({})
  const triggerController = useMemo(
    () => createCronTriggerController((key, running) => setRunningJobs(current => ({ ...current, [key]: running }))),
    []
  )

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
      const result = await triggerController.run(jobId, () => api.triggerCronJob(jobId))

      if (!result.started) return
      if (result.value) {
        // Trigger responses can include a state transition (and one-shot jobs
        // may disappear), so refresh from the backend instead of patching a
        // stale local row.
        void loadJobs()
      }
    } catch {
      setError(t.cron.saveFailed)
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

  const loadBlueprints = () => {
    setError(null)
    api.getAutomationBlueprints().then(setBlueprints).catch(() => setError('无法加载自动化模板。'))
  }

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={t.cron.title}>
      <div className="mb-3 flex justify-end gap-2">
        <button className="rounded-md bg-(--ui-bg-quaternary) px-3 py-1.5 text-(--conversation-tool-font-size) text-(--ui-text-secondary)" onClick={loadBlueprints}>自动化模板</button>
        <button className="rounded-md bg-(--ui-accent) px-3 py-1.5 text-(--conversation-tool-font-size) text-white" onClick={() => setEditor('new')}>{t.cron.new}</button>
      </div>
      {blueprints && <div className="mb-4 rounded-lg border border-(--ui-stroke-secondary) p-3"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium text-(--ui-text-primary)">自动化模板</p><button className="text-xs text-(--ui-text-tertiary)" onClick={() => setBlueprints(null)}>{t.common.close}</button></div>{blueprints.length === 0 ? <p className="text-xs text-(--ui-text-tertiary)">网关暂未提供模板。</p> : <div className="space-y-2">{blueprints.map(blueprint => <div key={blueprint.key} className="flex items-center gap-3 rounded-md bg-(--ui-widget-surface-background) p-2.5"><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-(--ui-text-primary)">{blueprint.title}</p><p className="mt-0.5 text-xs text-(--ui-text-tertiary)">{blueprint.description}</p></div><button className="shrink-0 rounded-md bg-(--theme-secondary,#1a5cff14) px-2.5 py-1.5 text-xs text-(--ui-accent)" onClick={() => setBlueprintEditor(blueprint)}>使用</button></div>)}</div>}</div>}
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
                  {job.name ?? job.id}
                </p>
                <p className="text-(--conversation-tool-font-size) text-(--ui-text-tertiary) mt-0.5 font-mono">
                  {job.schedule_display ?? job.schedule?.display ?? job.schedule?.expr ?? job.cron ?? ''}
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
                disabled={Boolean(runningJobs[job.id])}
                onClick={() => void triggerJob(job.id)}
              >
                {t.cron.runNow}
              </button>
              <button className="text-(--conversation-tool-font-size) px-2 py-1.5 text-(--ui-accent)" onClick={() => setRunsJob(job)}>运行记录</button>
              <button className="ml-auto text-(--conversation-tool-font-size) text-(--ui-text-tertiary)" onClick={() => setEditor(job)}>{t.cron.edit}</button>
              <button className="text-(--conversation-tool-font-size) text-(--ui-red)" onClick={() => void deleteJob(job.id)}>{t.common.delete}</button>
            </div>
          </div>
        ))}
      </div>

      {editor && <CronEditor job={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={job => { setJobs(previous => editor === 'new' ? [...previous, job] : previous.map(row => row.id === job.id ? job : row)); setEditor(null) }} />}
      {blueprintEditor && <AutomationBlueprintEditor blueprint={blueprintEditor} onClose={() => setBlueprintEditor(null)} onCreated={job => { setJobs(previous => [...previous, job]); setBlueprintEditor(null) }} />}
      {runsJob ? <CronRunsSheet job={runsJob} onClose={() => setRunsJob(null)} onOpenSession={onOpenSession} /> : null}
    </ResponsiveSheet>
  )
}

function CronRunsSheet({ job, onClose, onOpenSession }: { job: CronJob; onClose: () => void; onOpenSession?: (id: string) => void }) {
  const [runs, setRuns] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void api.getCronJobRuns(job.id).then(result => { if (active) setRuns(result) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load run history') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [job.id])
  return <ResponsiveSheet compact onClose={onClose} open title={`${job.name || job.id} · 运行记录`}><div className="space-y-2">{loading ? <div className="py-5 text-center text-xs text-(--ui-text-quaternary)">加载中…</div> : null}{error ? <div className="text-xs text-(--ui-red)">{error}</div> : null}{!loading && !error && !runs.length ? <div className="py-5 text-center text-xs text-(--ui-text-quaternary)">暂无运行记录</div> : null}{runs.map(run => <button className="w-full rounded-md border border-(--ui-stroke-tertiary) px-3 py-2.5 text-left hover:bg-(--chrome-action-hover)" key={run.id} onClick={() => { onOpenSession?.(run.id); onClose() }} type="button"><span className="block truncate text-xs font-medium text-(--ui-text-primary)">{run.title || run.id}</span><span className="mt-0.5 block text-[0.68rem] text-(--ui-text-quaternary)">{run.updated_at || run.created_at || '—'}</span></button>)}</div></ResponsiveSheet>
}

function AutomationBlueprintEditor({ blueprint, onClose, onCreated }: { blueprint: AutomationBlueprint; onClose: () => void; onCreated: (job: CronJob) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(blueprint.fields.map(field => [field.name, field.default ?? ''])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = blueprint.fields.every(field => field.optional || values[field.name]?.trim())
  const instantiate = async () => {
    if (!valid) return
    setSaving(true); setError(null)
    try { onCreated(await api.instantiateAutomationBlueprint(blueprint.key, values)) } catch { setError('无法创建自动化任务。') } finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" onClick={onClose}><div className="w-full rounded-t-xl bg-(--ui-bg-elevated) p-4 pb-[calc(1rem+var(--safe-area-bottom))] md:min-w-[26rem] md:max-w-lg md:rounded-xl" onClick={event => event.stopPropagation()}><div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-semibold text-(--ui-text-primary)">{blueprint.title}</h2><button className="text-xs text-(--ui-text-tertiary)" onClick={onClose}>关闭</button></div><p className="mb-4 text-xs text-(--ui-text-tertiary)">{blueprint.description}</p>{blueprint.fields.map(field => <label key={field.name} className="mb-3 block"><span className="mb-1 block text-xs text-(--ui-text-secondary)">{field.label}{field.optional ? '（可选）' : ''}</span>{field.type === 'enum' ? <select value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-xs text-(--ui-text-primary)"><option value="">请选择</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : <input type={field.type === 'time' ? 'time' : 'text'} value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} placeholder={field.options.join(', ')} className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-xs text-(--ui-text-primary)" />}{field.help && <span className="mt-1 block text-[11px] text-(--ui-text-quaternary)">{field.help}</span>}</label>)}{error && <p className="mb-3 text-xs text-(--ui-red)">{error}</p>}<button disabled={!valid || saving} onClick={() => void instantiate()} className="w-full rounded-md bg-(--ui-accent) px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{saving ? '创建中…' : '创建自动化任务'}</button></div></div>
}

function CronEditor({ job, onClose, onSaved }: { job?: CronJob; onClose: () => void; onSaved: (job: CronJob) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(job?.name ?? '')
  const [cron, setCron] = useState(job?.schedule?.expr ?? job?.cron ?? '')
  const [prompt, setPrompt] = useState(job?.prompt ?? '')
  const [deliveryTargets, setDeliveryTargets] = useState<Awaited<ReturnType<typeof api.getCronDeliveryTargets>>>([])
  const [delivery, setDelivery] = useState(job?.deliver ?? '')
  const [providers, setProviders] = useState<ModelOptionProvider[]>([])
  const [provider, setProvider] = useState(job?.provider ?? '')
  const [model, setModel] = useState(job?.model ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = name.trim() && cron.trim() && prompt.trim()

  useEffect(() => {
    let active = true
    void api.getCronDeliveryTargets().then(targets => {
      if (active) setDeliveryTargets(targets)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void api.getModelOptions().then(result => { if (active) setProviders(result.providers ?? []) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const selectedProvider = (() => {
    const found = providers.find(item => item.slug === provider)
    return found ? { ...found, models: found.models ?? [] } : null
  })()

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      const saved = job
        ? await api.updateCronJob(job.id, { name: name.trim(), schedule: cron.trim(), prompt: prompt.trim(), deliver: delivery || undefined, model: model || null, provider: provider || null })
        : await api.createCronJob({ name: name.trim(), schedule: cron.trim(), prompt: prompt.trim(), ...(delivery ? { deliver: delivery } : {}), ...(model ? { model } : {}), ...(provider ? { provider } : {}) })
      onSaved(saved)
    } catch {
      setError(t.cron.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center md:p-6" onClick={onClose}><div className="w-full md:w-auto md:min-w-[26rem] md:max-h-[80vh] md:overflow-y-auto rounded-t-xl md:rounded-xl bg-(--ui-bg-elevated) p-4 pb-[calc(1rem+var(--safe-area-bottom))]" onClick={event => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-(--ui-text-primary)">{job ? t.cron.editTitle : t.cron.newTitle}</h2><button className="text-xs text-(--ui-text-tertiary)" onClick={onClose}>{t.common.close}</button></div><EditorField label={t.cron.name} value={name} onChange={setName} placeholder={t.cron.namePlaceholder} /><EditorField label={t.cron.schedule} value={cron} onChange={setCron} placeholder="0 9 * * 1-5" /><label className="mb-3 block"><span className="mb-1 block text-(--conversation-tool-font-size) text-(--ui-text-secondary)">Provider（可选）</span><select value={provider} onChange={event => { setProvider(event.target.value); setModel('') }} className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"><option value="">使用当前默认模型</option>{providers.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>{provider ? <label className="mb-3 block"><span className="mb-1 block text-(--conversation-tool-font-size) text-(--ui-text-secondary)">Model（可选）</span><select value={model} onChange={event => setModel(event.target.value)} className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"><option value="">使用 Provider 默认模型</option>{selectedProvider?.models.map(item => <option key={item} value={item}>{item}</option>)}</select></label> : null}<label className="mb-3 block"><span className="mb-1 block text-(--conversation-tool-font-size) text-(--ui-text-secondary)">{t.cron.delivery}</span><select value={delivery} onChange={event => setDelivery(event.target.value)} disabled={!deliveryTargets.length} className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"><option value="">{deliveryTargets.length ? t.cron.deliveryNone : t.cron.deliveryUnavailable}</option>{deliveryTargets.map(target => <option key={target.id} value={target.id}>{target.name}{target.home_target_set ? '' : ` (${t.cron.deliveryNotConfigured})`}</option>)}</select></label><label className="mb-3 block"><span className="mb-1 block text-(--conversation-tool-font-size) text-(--ui-text-secondary)">{t.cron.prompt}</span><textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={4} className="w-full resize-none rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-accent)" placeholder={t.cron.promptPlaceholder} /></label>{error && <p className="mb-3 text-xs text-(--ui-red)">{error}</p>}<button disabled={!valid || saving} onClick={() => void save()} className="w-full rounded-md bg-(--ui-accent) px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{saving ? t.common.saving : t.cron.saveCron}</button></div></div>
}

function EditorField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="mb-3 block"><span className="mb-1 block text-(--conversation-tool-font-size) text-(--ui-text-secondary)">{label}</span><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-card) px-2.5 py-2 text-xs text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent)" /></label>
}
