import { useEffect, useState } from 'react'

import * as api from '@/gateway/api'
import type { ToolProvider, ToolsetConfig, ToolsetModelsResponse } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { ResponsiveSheet } from '@/ui/ResponsiveSheet'

interface ToolsetConfigSheetProps {
  name: string
  onClose: () => void
  open: boolean
}

/** Configuration for a Gateway-owned toolset. Provider commands, credential
 * storage, and setup scripts are delegated to the Gateway API. */
export function ToolsetConfigSheet({ name, onClose, open }: ToolsetConfigSheetProps) {
  const [config, setConfig] = useState<ToolsetConfig | null>(null)
  const [models, setModels] = useState<ToolsetModelsResponse | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const refresh = async () => {
    setWorking('load'); setNotice('')
    try {
      const next = await api.getToolsetConfig(name)
      setConfig(next)
      const active = next.active_provider || next.providers.find(provider => provider.is_active)?.name
      setModels(await api.getToolsetModels(name, active).catch(() => null))
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to load toolset configuration') } finally { setWorking(null) }
  }

  useEffect(() => { if (open) void refresh() }, [open, name])

  const chooseProvider = async (provider: ToolProvider, capability?: 'search' | 'extract') => {
    setWorking(`provider:${provider.name}`); setNotice('')
    try {
      const result = await api.selectToolsetProvider(name, provider.name, capability)
      setNotice(result.needs_nous_auth ? 'This provider needs a Nous account on the connected Gateway.' : `${provider.name} selected.`)
      await refresh()
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to select provider') } finally { setWorking(null) }
  }

  const saveKey = async (field: ToolProvider['env_vars'][number]) => {
    const value = window.prompt(field.prompt || `Value for ${field.key}`)
    if (!value?.trim()) return
    setWorking(`key:${field.key}`); setNotice('')
    try { await api.setEnvVar(field.key, value.trim()); setNotice(`${field.key} saved on the connected Gateway.`); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to save credential') } finally { setWorking(null) }
  }

  const postSetup = async (provider: ToolProvider) => {
    if (!provider.post_setup || !window.confirm(`Run setup for ${provider.name} on the connected Gateway?`)) return
    setWorking(`setup:${provider.name}`); setNotice('')
    try { const result = await api.runToolsetPostSetup(name, provider.post_setup); setNotice(result.message || 'Setup started on the connected Gateway.'); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to run setup') } finally { setWorking(null) }
  }

  const chooseModel = async (model: string) => {
    setWorking(`model:${model}`); setNotice('')
    try { await api.selectToolsetModel(name, model, models?.provider ?? undefined); setNotice(`${model} selected.`); await refresh() } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to select model') } finally { setWorking(null) }
  }

  return <ResponsiveSheet onClose={onClose} open={open} title={`${name} toolset`}><div className="space-y-4">
    {working === 'load' && !config ? <div className="py-5 text-center text-xs text-(--ui-text-quaternary)">Loading Gateway toolset…</div> : null}
    {notice ? <div className="rounded-md bg-(--ui-bg-quaternary) px-2.5 py-2 text-xs text-(--ui-text-secondary)">{notice}</div> : null}
    {config ? <>
      <section className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)"><div className="border-b border-(--ui-stroke-tertiary) px-3 py-2 text-xs font-medium text-(--ui-text-primary)">Provider</div>{config.providers.map(provider => <div className="border-b border-(--ui-stroke-tertiary) px-3 py-2.5 last:border-b-0" key={provider.name}><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="text-xs font-medium text-(--ui-text-primary)">{provider.name} {provider.badge ? <span className="text-(--ui-text-quaternary)">· {provider.badge}</span> : null}</div><div className="mt-0.5 text-[0.68rem] text-(--ui-text-tertiary)">{provider.status || (provider.is_active ? 'ready' : 'available')}</div></div>{provider.is_active ? <span className="text-[0.68rem] text-emerald-600">Active</span> : <Button disabled={working !== null} onClick={() => void chooseProvider(provider)} size="sm" variant="secondary">Select</Button>}</div>{provider.capabilities?.length === 2 ? <div className="mt-2 flex gap-2 text-[0.68rem]"><button className="text-(--ui-accent)" disabled={working !== null} onClick={() => void chooseProvider(provider, 'search')}>Use for search</button><button className="text-(--ui-accent)" disabled={working !== null} onClick={() => void chooseProvider(provider, 'extract')}>Use for extract</button></div> : null}{provider.env_vars.map(field => <div className="mt-2 flex items-center gap-2 rounded bg-(--ui-bg-quaternary) px-2 py-1.5 text-[0.68rem]" key={field.key}><span className="min-w-0 flex-1 truncate font-mono">{field.key} · {field.is_set ? 'set' : 'not set'}</span><button className="text-(--ui-accent)" disabled={working !== null} onClick={() => void saveKey(field)}>{field.is_set ? 'Replace' : 'Set'}</button></div>)}{provider.post_setup ? <button className="mt-2 text-[0.68rem] text-(--ui-accent)" disabled={working !== null} onClick={() => void postSetup(provider)}>Run provider setup</button> : null}</div>)}</section>
      {models?.has_models ? <section className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)"><div className="border-b border-(--ui-stroke-tertiary) px-3 py-2 text-xs font-medium text-(--ui-text-primary)">Model</div>{models.models.map(model => <button className="flex w-full items-center gap-3 border-b border-(--ui-stroke-tertiary) px-3 py-2.5 text-left last:border-b-0 hover:bg-(--chrome-action-hover)" disabled={working !== null} key={model.id} onClick={() => void chooseModel(model.id)}><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-(--ui-text-primary)">{model.display || model.id}</span>{model.strengths ? <span className="block truncate text-[0.68rem] text-(--ui-text-quaternary)">{model.strengths}</span> : null}</span>{models.current === model.id ? <span className="text-[0.68rem] text-emerald-600">Selected</span> : null}</button>)}</section> : null}
    </> : null}
  </div></ResponsiveSheet>
}
