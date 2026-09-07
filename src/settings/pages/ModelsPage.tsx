import { useCallback, useEffect, useMemo, useState } from 'react'

import * as api from '@/gateway/api'
import { useI18n } from '@/i18n'
import type {
  AuxiliaryModelsResponse,
  HermesConfigRecord,
  ModelOptionProvider,
  MoaConfigResponse,
  MoaModelSlot,
  StaleAuxAssignment
} from '@/types/hermes'
import { Button, Spinner } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { cn } from '@/ui/utils'

import { AUX_TASKS, DEFAULT_REASONING_EFFORT, REASONING_EFFORT_VALUES } from '../constants'
import { getNested, isFastTier, setNested, withActive } from '../helpers'
import { AlertTriangleIcon, CpuIcon } from '../icons'
import { Caption, ErrorNote, PickerSheet, Pill, Row, SectionHeading, Toggle, ValueButton, WarningBanner, type PickerOption } from '../ui'

const NO_PROVIDERS: readonly ModelOptionProvider[] = [{ name: '—', slug: '', models: [] }]

function isProviderReady(p?: ModelOptionProvider): boolean {
  return !!p && (p.authenticated !== false || (p.models?.length ?? 0) > 0)
}

const moaSlotComplete = (slot: MoaModelSlot): boolean => !!(slot.provider.trim() && slot.model.trim())

const moaConfigComplete = (config: MoaConfigResponse): boolean =>
  Object.values(config.presets).every(
    preset =>
      preset.reference_models.length > 0 &&
      preset.reference_models.every(moaSlotComplete) &&
      moaSlotComplete(preset.aggregator)
  )

type PickerId =
  | 'main-provider'
  | 'main-model'
  | 'aux-provider'
  | 'aux-model'
  | 'reasoning'
  | 'moa-preset'
  | `moa-ref-provider:${number}`
  | `moa-ref-model:${number}`
  | `moa-agg-provider`
  | `moa-agg-model`

export function ModelsPage() {
  const { t } = useI18n()
  const m = t.settings.modelPage

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mainModel, setMainModel] = useState<{ model: string; provider: string } | null>(null)
  const [providers, setProviders] = useState<ModelOptionProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [auxiliary, setAuxiliary] = useState<AuxiliaryModelsResponse | null>(null)
  const [moa, setMoa] = useState<MoaConfigResponse | null>(null)
  const [selectedMoaPreset, setSelectedMoaPreset] = useState('')
  const [newMoaPresetName, setNewMoaPresetName] = useState('')
  const [config, setConfig] = useState<HermesConfigRecord | null>(null)
  const [applying, setApplying] = useState(false)
  const [editingAuxTask, setEditingAuxTask] = useState<string | null>(null)
  const [auxDraft, setAuxDraft] = useState<{ model: string; provider: string }>({ model: '', provider: '' })
  const [switchStaleAux, setSwitchStaleAux] = useState<StaleAuxAssignment[]>([])
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [activating, setActivating] = useState(false)
  const [picker, setPicker] = useState<PickerId | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [modelInfo, modelOptions, auxiliaryModels, moaModels, configRecord] = await Promise.all([
        api.getModelInfo(),
        api.getModelOptions(),
        api.getAuxiliaryModels(),
        api.getMoaModels().catch(() => null),
        api.getConfigRecord().catch(() => null)
      ])

      setMainModel({ model: modelInfo.model, provider: modelInfo.provider })
      setProviders(modelOptions.providers || [])
      setSelectedProvider(prev => prev || modelInfo.provider)
      setSelectedModel(prev => prev || modelInfo.model)
      setAuxiliary(auxiliaryModels)
      setMoa(moaModels)
      setConfig(configRecord)

      if (moaModels) {
        setSelectedMoaPreset(prev => (prev && moaModels.presets[prev] ? prev : moaModels.default_preset))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const providerOptions = providers.length ? providers : NO_PROVIDERS

  const mainProviderOptions = useMemo(
    () =>
      selectedProvider && !providers.some(provider => provider.slug === selectedProvider)
        ? [{ name: selectedProvider, slug: selectedProvider, models: [] }, ...providers]
        : providerOptions,
    [providerOptions, providers, selectedProvider]
  )

  const selectedProviderRow = useMemo(
    () => providers.find(provider => provider.slug === selectedProvider),
    [providers, selectedProvider]
  )

  const selectedProviderModels = selectedProviderRow?.models ?? []
  const needsSetup = !!selectedProvider && !isProviderReady(selectedProviderRow)
  const setupIsApiKey = needsSetup && selectedProviderRow?.auth_type === 'api_key' && !!selectedProviderRow?.key_env

  useEffect(() => {
    setApiKeyDraft('')
  }, [selectedProvider])

  const auxDraftProviderModels = useMemo(
    () => providers.find(provider => provider.slug === auxDraft.provider)?.models ?? [],
    [auxDraft.provider, providers]
  )

  const modelsForProvider = useCallback(
    (provider: string) => providers.find(row => row.slug === provider)?.models ?? [],
    [providers]
  )

  const currentMoaPreset = useMemo(() => {
    if (!moa) {
      return null
    }

    return moa.presets[selectedMoaPreset] || moa.presets[moa.default_preset] || Object.values(moa.presets)[0] || null
  }, [moa, selectedMoaPreset])

  const moaSlotProviderOptions = providerOptions.filter(provider => (provider.slug || '').toLowerCase() !== 'moa')

  const auxiliaryTaskLabel = useCallback(
    (key: string) => m.tasks[key as keyof typeof m.tasks]?.label ?? key,
    [m]
  )

  const persistentStaleAux = useMemo<StaleAuxAssignment[]>(() => {
    const mainProvider = (mainModel?.provider ?? '').toLowerCase()

    if (!mainProvider || !auxiliary) {
      return []
    }

    return auxiliary.tasks
      .filter(entry => {
        const p = (entry.provider ?? '').toLowerCase()

        return p && p !== 'auto' && p !== mainProvider
      })
      .map(entry => ({ task: entry.task, provider: entry.provider, model: entry.model }))
  }, [auxiliary, mainModel])

  const mainCaps = useMemo(() => {
    const row = providers.find(provider => provider.slug === mainModel?.provider)

    return mainModel ? row?.capabilities?.[mainModel.model] : undefined
  }, [providers, mainModel])

  const reasoningSupported = mainCaps?.reasoning ?? true
  const fastSupported = mainCaps?.fast ?? false

  const rawEffort = String(getNested(config ?? {}, 'agent.reasoning_effort') ?? '')
    .trim()
    .toLowerCase()
  const effortValue = rawEffort === 'false' || rawEffort === 'disabled' ? 'none' : rawEffort || DEFAULT_REASONING_EFFORT
  const fastOn = isFastTier(getNested(config ?? {}, 'agent.service_tier'))

  const writeAgentDefault = useCallback(
    async (key: string, value: string) => {
      if (!config) {
        return
      }

      const prev = config
      const next = setNested(config, key, value)

      setConfig(next)

      try {
        await api.saveConfig(next)
      } catch (err) {
        setConfig(prev)
        setError(err instanceof Error ? err.message : m.defaultsFailed)
      }
    },
    [config, m.defaultsFailed]
  )

  const endpointForProvider = useCallback(
    (provider: string) => {
      const row = providers.find(entry => entry.slug === provider)

      return row?.api_url ? { base_url: row.api_url } : {}
    },
    [providers]
  )

  const applyMainModel = useCallback(async () => {
    if (!selectedProvider || !selectedModel) {
      return
    }

    setApplying(true)
    setError('')

    try {
      const result = await api.setModelAssignment({
        model: selectedModel,
        provider: selectedProvider,
        scope: 'main',
        ...(selectedProviderRow?.api_url ? { base_url: selectedProviderRow.api_url } : {})
      })

      setMainModel({ provider: result.provider || selectedProvider, model: result.model || selectedModel })
      setSwitchStaleAux(result.stale_aux ?? [])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [refresh, selectedModel, selectedProvider, selectedProviderRow])

  const activateApiKeyProvider = useCallback(async () => {
    const keyEnv = selectedProviderRow?.key_env
    const slug = selectedProviderRow?.slug

    if (!keyEnv || !slug || !apiKeyDraft.trim()) {
      return
    }

    setActivating(true)
    setError('')

    try {
      await api.setEnvVar(keyEnv, apiKeyDraft.trim())
      setApiKeyDraft('')

      let nextModel = ''

      try {
        nextModel = (await api.getRecommendedDefaultModel(slug)).model || ''
      } catch {
        nextModel = ''
      }

      const options = await api.getModelOptions()

      setProviders(options.providers || [])

      const fallbackModel = options.providers?.find(p => p.slug === slug)?.models?.[0] ?? ''

      setSelectedModel(nextModel || fallbackModel)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setActivating(false)
    }
  }, [apiKeyDraft, selectedProviderRow])

  const setAuxiliaryToMain = useCallback(
    async (task: string) => {
      if (!mainModel) {
        return
      }

      setApplying(true)
      setError('')

      try {
        await api.setModelAssignment({
          model: mainModel.model,
          provider: mainModel.provider,
          scope: 'auxiliary',
          task,
          ...endpointForProvider(mainModel.provider)
        })
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setApplying(false)
      }
    },
    [endpointForProvider, mainModel, refresh]
  )

  const applyAuxiliaryDraft = useCallback(
    async (task: string) => {
      if (!auxDraft.provider || !auxDraft.model) {
        return
      }

      setApplying(true)
      setError('')

      try {
        await api.setModelAssignment({
          model: auxDraft.model,
          provider: auxDraft.provider,
          scope: 'auxiliary',
          task,
          ...endpointForProvider(auxDraft.provider)
        })
        setEditingAuxTask(null)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setApplying(false)
      }
    },
    [auxDraft, endpointForProvider, refresh]
  )

  const beginAuxiliaryEdit = useCallback(
    (task: string) => {
      const current = auxiliary?.tasks.find(entry => entry.task === task)
      const initialProvider =
        current?.provider && current.provider !== 'auto' ? current.provider : (mainModel?.provider ?? '')
      const initialModel = current?.model || mainModel?.model || ''

      setAuxDraft({ provider: initialProvider, model: initialModel })
      setEditingAuxTask(task)
    },
    [auxiliary, mainModel]
  )

  const resetAuxiliaryModels = useCallback(async () => {
    if (!mainModel) {
      return
    }

    setApplying(true)
    setError('')

    try {
      await api.setModelAssignment({
        model: mainModel.model,
        provider: mainModel.provider,
        scope: 'auxiliary',
        task: '__reset__'
      })
      setSwitchStaleAux([])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [mainModel, refresh])

  const updateMoaPreset = useCallback(
    (updater: (preset: NonNullable<typeof currentMoaPreset>) => NonNullable<typeof currentMoaPreset>) => {
      if (!moa || !selectedMoaPreset || !moa.presets[selectedMoaPreset]) {
        return
      }

      const next: MoaConfigResponse = {
        ...moa,
        presets: {
          ...moa.presets,
          [selectedMoaPreset]: updater(moa.presets[selectedMoaPreset])
        }
      }

      setMoa(next)

      if (moaConfigComplete(next)) {
        void api.saveMoaModels(next).then(setMoa).catch(err => setError(err instanceof Error ? err.message : String(err)))
      }
    },
    [moa, selectedMoaPreset]
  )

  const saveMoa = useCallback(async (next: MoaConfigResponse) => {
    setApplying(true)
    setError('')

    try {
      setMoa(await api.saveMoaModels(next))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [])

  if (loading && !mainModel) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center">
        <Spinner className="size-4 text-(--ui-text-tertiary)" />
        <Caption>{t.common.loading}</Caption>
      </div>
    )
  }

  const staleSlots = switchStaleAux.length > 0 ? switchStaleAux : persistentStaleAux

  const providerPickerOptions = (rows: readonly ModelOptionProvider[]): PickerOption[] =>
    rows.map(provider => ({
      value: provider.slug || 'none',
      label: provider.name,
      description: provider.models?.length ? m.modelsCount(provider.models.length) : undefined
    }))

  const pickerOptions: PickerOption[] = (() => {
    if (!picker) {
      return []
    }

    if (picker === 'main-provider') {
      return providerPickerOptions(mainProviderOptions)
    }

    if (picker === 'main-model') {
      return withActive(selectedProviderModels, selectedModel).map(model => ({ value: model, label: model }))
    }

    if (picker === 'aux-provider') {
      return providerPickerOptions(providerOptions)
    }

    if (picker === 'aux-model') {
      return withActive(auxDraftProviderModels, auxDraft.model).map(model => ({ value: model, label: model }))
    }

    if (picker === 'reasoning') {
      return REASONING_EFFORT_VALUES.map(value => ({
        value,
        label: value === 'none' ? m.reasoningOff : (m.efforts[value as keyof typeof m.efforts] ?? value)
      }))
    }

    if (picker === 'moa-preset' && moa) {
      return Object.keys(moa.presets).map(name => ({ value: name, label: name }))
    }

    if (picker.startsWith('moa-ref-provider:') && currentMoaPreset) {
      return withActive(
        moaSlotProviderOptions.map(p => p.slug || 'none'),
        currentMoaPreset.reference_models[Number(picker.split(':')[1])]?.provider ?? ''
      ).map(slug => ({ value: slug, label: moaSlotProviderOptions.find(p => (p.slug || 'none') === slug)?.name || slug }))
    }

    if (picker.startsWith('moa-ref-model:') && currentMoaPreset) {
      const slot = currentMoaPreset.reference_models[Number(picker.split(':')[1])]

      return withActive(modelsForProvider(slot?.provider ?? ''), slot?.model ?? '').map(model => ({ value: model, label: model }))
    }

    if (picker === 'moa-agg-provider' && currentMoaPreset) {
      return withActive(
        moaSlotProviderOptions.map(p => p.slug || 'none'),
        currentMoaPreset.aggregator.provider
      ).map(slug => ({ value: slug, label: moaSlotProviderOptions.find(p => (p.slug || 'none') === slug)?.name || slug }))
    }

    if (picker === 'moa-agg-model' && currentMoaPreset) {
      return withActive(modelsForProvider(currentMoaPreset.aggregator.provider), currentMoaPreset.aggregator.model).map(
        model => ({ value: model, label: model })
      )
    }

    return []
  })()

  const pickerValue: string = (() => {
    if (!picker) {
      return ''
    }

    if (picker === 'main-provider') {
      return selectedProvider || 'none'
    }

    if (picker === 'main-model') {
      return selectedModel
    }

    if (picker === 'aux-provider') {
      return auxDraft.provider || 'none'
    }

    if (picker === 'aux-model') {
      return auxDraft.model
    }

    if (picker === 'reasoning') {
      return effortValue
    }

    if (picker === 'moa-preset') {
      return selectedMoaPreset || moa?.default_preset || ''
    }

    if (picker.startsWith('moa-ref-provider:')) {
      return currentMoaPreset?.reference_models[Number(picker.split(':')[1])]?.provider ?? ''
    }

    if (picker.startsWith('moa-ref-model:')) {
      return currentMoaPreset?.reference_models[Number(picker.split(':')[1])]?.model ?? ''
    }

    if (picker === 'moa-agg-provider') {
      return currentMoaPreset?.aggregator.provider ?? ''
    }

    if (picker === 'moa-agg-model') {
      return currentMoaPreset?.aggregator.model ?? ''
    }

    return ''
  })()

  const handlePick = (value: string) => {
    if (!picker) {
      return
    }

    if (picker === 'main-provider') {
      setSelectedProvider(value === 'none' ? '' : value)
      setSelectedModel('')
    } else if (picker === 'main-model') {
      setSelectedModel(value)
    } else if (picker === 'aux-provider') {
      setAuxDraft(prev => ({ ...prev, provider: value === 'none' ? '' : value, model: '' }))
    } else if (picker === 'aux-model') {
      setAuxDraft(prev => ({ ...prev, model: value }))
    } else if (picker === 'reasoning') {
      void writeAgentDefault('agent.reasoning_effort', value)
    } else if (picker === 'moa-preset') {
      setSelectedMoaPreset(value)
    } else if (picker.startsWith('moa-ref-provider:')) {
      const index = Number(picker.split(':')[1])

      updateMoaPreset(prev => ({
        ...prev,
        reference_models: prev.reference_models.map((slot, i) =>
          i === index ? { ...slot, provider: value === 'none' ? '' : value, model: '' } : slot
        )
      }))
    } else if (picker.startsWith('moa-ref-model:')) {
      const index = Number(picker.split(':')[1])

      updateMoaPreset(prev => ({
        ...prev,
        reference_models: prev.reference_models.map((slot, i) => (i === index ? { ...slot, model: value } : slot))
      }))
    } else if (picker === 'moa-agg-provider') {
      updateMoaPreset(prev => ({ ...prev, aggregator: { ...prev.aggregator, provider: value === 'none' ? '' : value, model: '' } }))
    } else if (picker === 'moa-agg-model') {
      updateMoaPreset(prev => ({ ...prev, aggregator: { ...prev.aggregator, model: value } }))
    }
  }

  return (
    <div>
      <Caption className="mb-3">{m.appliesDesc}</Caption>

      <div className="space-y-2">
        <Row
          action={
            <ValueButton onClick={() => setPicker('main-provider')}>
              {mainProviderOptions.find(p => p.slug === selectedProvider)?.name ?? selectedProvider}
            </ValueButton>
          }
          title={t.settings.provider}
        />
        {needsSetup && setupIsApiKey ? (
          <div className="space-y-2">
            <Input
              autoComplete="off"
              onChange={event => setApiKeyDraft(event.target.value)}
              placeholder={m.pasteKey(selectedProviderRow?.key_env ?? 'API key')}
              type="password"
              value={apiKeyDraft}
            />
            <Button className="w-full" disabled={!apiKeyDraft.trim() || activating} onClick={() => void activateApiKeyProvider()}>
              {activating && <Spinner className="size-3.5" />}
              {activating ? m.activating : m.activate}
            </Button>
          </div>
        ) : (
          <Row
            action={<ValueButton onClick={() => setPicker('main-model')}>{selectedModel}</ValueButton>}
            title={t.settings.model}
          />
        )}
        {needsSetup && !setupIsApiKey && (
          <Caption>
            {selectedProviderRow?.auth_type === 'api_key'
              ? m.setupHintKey(selectedProviderRow?.name ?? '')
              : m.setupHintOAuth(selectedProviderRow?.name ?? '')}
          </Caption>
        )}
        {!needsSetup && (
          <Button className="w-full" disabled={!selectedProvider || !selectedModel || applying} onClick={() => void applyMainModel()}>
            {applying && <Spinner className="size-3.5" />}
            {applying ? m.applying : m.apply}
          </Button>
        )}
      </div>

      {config && mainModel && (reasoningSupported || fastSupported) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Caption>{m.defaultsLabel}</Caption>
          {reasoningSupported && (
            <div className="flex items-center gap-2">
              <span className="text-(--conversation-caption-font-size) text-(--ui-text-secondary)">{m.reasoning}</span>
              <ValueButton onClick={() => setPicker('reasoning')}>
                {effortValue === 'none' ? m.reasoningOff : (m.efforts[effortValue as keyof typeof m.efforts] ?? effortValue)}
              </ValueButton>
            </div>
          )}
          {fastSupported && (
            <label className="flex items-center gap-2">
              <span className="text-(--conversation-caption-font-size) text-(--ui-text-secondary)">{m.fast}</span>
              <Toggle checked={fastOn} onChange={on => void writeAgentDefault('agent.service_tier', on ? 'fast' : 'normal')} />
            </label>
          )}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>

      {staleSlots.length > 0 && (
        <div className="mt-3">
          <WarningBanner
            action={
              <Button disabled={applying} onClick={() => void resetAuxiliaryModels()} size="sm" variant="text">
                {m.resetAllToMain}
              </Button>
            }
          >
            <span className="flex items-start gap-1.5">
              <AlertTriangleIcon className="size-3.5 shrink-0 mt-0.5" />
              <span>
                {m.staleWarning(
                  staleSlots.length,
                  staleSlots.map(slot => auxiliaryTaskLabel(slot.task)).join(', '),
                  staleSlots.every(slot => slot.provider === staleSlots[0].provider)
                    ? staleSlots[0].provider
                    : m.otherProviders
                )}
              </span>
            </span>
          </WarningBanner>
        </div>
      )}

      <SectionHeading
        action={
          <Button disabled={!mainModel || applying} onClick={() => void resetAuxiliaryModels()} size="sm" variant="text">
            {m.resetAllToMain}
          </Button>
        }
        icon={CpuIcon}
        title={m.auxiliaryTitle}
      />
      <Caption className="mb-2">{m.auxiliaryDesc}</Caption>

      <div>
        {AUX_TASKS.map(meta => {
          const copy = m.tasks[meta.key as keyof typeof m.tasks] ?? { hint: meta.key, label: meta.key }
          const current = auxiliary?.tasks.find(entry => entry.task === meta.key)
          const isAuto = !current || !current.provider || current.provider === 'auto'
          const isEditing = editingAuxTask === meta.key

          return (
            <Row
              action={
                !isEditing && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button disabled={!mainModel || applying} onClick={() => void setAuxiliaryToMain(meta.key)} size="sm" variant="text">
                      {m.setToMain}
                    </Button>
                    <Button disabled={!providers.length || applying} onClick={() => beginAuxiliaryEdit(meta.key)} size="sm" variant="text">
                      {m.change}
                    </Button>
                  </div>
                )
              }
              below={
                isEditing && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <ValueButton onClick={() => setPicker('aux-provider')}>
                      {providerOptions.find(p => p.slug === auxDraft.provider)?.name ?? auxDraft.provider}
                    </ValueButton>
                    <ValueButton onClick={() => setPicker('aux-model')}>{auxDraft.model}</ValueButton>
                    <Button
                      disabled={!auxDraft.provider || !auxDraft.model || applying}
                      onClick={() => void applyAuxiliaryDraft(meta.key)}
                      size="sm"
                    >
                      {applying ? m.applying : m.apply}
                    </Button>
                    <Button onClick={() => setEditingAuxTask(null)} size="sm" variant="ghost">
                      {t.common.close}
                    </Button>
                  </div>
                )
              }
              description={
                <span className="font-mono text-[0.68rem]">
                  {isAuto ? m.autoUseMain : `${current?.provider} · ${current?.model || m.providerDefault}`}
                </span>
              }
              key={meta.key}
              title={
                <span className="flex items-center gap-2">
                  {copy.label}
                  <Pill>{copy.hint}</Pill>
                </span>
              }
            />
          )
        })}
      </div>

      {moa && currentMoaPreset && (
        <>
          <SectionHeading icon={CpuIcon} title={m.moaTitle} />
          <Caption className="mb-2">{m.moaDesc}</Caption>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <ValueButton onClick={() => setPicker('moa-preset')}>{selectedMoaPreset || moa.default_preset}</ValueButton>
            <label className="flex items-center gap-2">
              <span className="text-(--conversation-caption-font-size) text-(--ui-text-secondary)">{m.moaEnabled}</span>
              <Toggle
                checked={currentMoaPreset.enabled !== false}
                onChange={checked => updateMoaPreset(prev => ({ ...prev, enabled: checked }))}
              />
            </label>
            <Button
              disabled={applying}
              onClick={() => void saveMoa({ ...moa, default_preset: selectedMoaPreset || moa.default_preset })}
              size="sm"
              variant="text"
            >
              {m.moaSetDefault}
            </Button>
            <Button
              disabled={Object.keys(moa.presets).length <= 1 || applying}
              onClick={() => {
                const presets = { ...moa.presets }

                delete presets[selectedMoaPreset]

                const fallback = Object.keys(presets)[0]

                void saveMoa({
                  ...moa,
                  presets,
                  default_preset: moa.default_preset === selectedMoaPreset ? fallback : moa.default_preset,
                  active_preset: moa.active_preset === selectedMoaPreset ? '' : moa.active_preset
                })
                setSelectedMoaPreset(fallback)
              }}
              size="sm"
              variant="ghost"
            >
              {m.moaDelete}
            </Button>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <Input
              className="flex-1"
              onChange={event => setNewMoaPresetName(event.target.value)}
              placeholder={m.moaPresetPlaceholder}
              value={newMoaPresetName}
            />
            <Button
              disabled={!newMoaPresetName.trim() || !!moa.presets[newMoaPresetName.trim()] || applying}
              onClick={() => {
                const name = newMoaPresetName.trim()

                void saveMoa({
                  ...moa,
                  presets: { ...moa.presets, [name]: { ...currentMoaPreset, reference_models: [...currentMoaPreset.reference_models] } }
                })
                setSelectedMoaPreset(name)
                setNewMoaPresetName('')
              }}
              size="sm"
            >
              {m.moaAddPreset}
            </Button>
          </div>

          <Caption className="mb-1 font-mono">{m.moaDefault(moa.default_preset)}</Caption>

          {currentMoaPreset.reference_models.map((slot, index) => (
            <Row
              action={
                <Toggle
                  checked={slot.enabled !== false}
                  onChange={checked =>
                    updateMoaPreset(prev => ({
                      ...prev,
                      reference_models: prev.reference_models.map((s, i) => (i === index ? { ...s, enabled: checked } : s))
                    }))
                  }
                />
              }
              below={
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <ValueButton onClick={() => setPicker(`moa-ref-provider:${index}`)}>
                    {moaSlotProviderOptions.find(p => p.slug === slot.provider)?.name ?? slot.provider}
                  </ValueButton>
                  <ValueButton onClick={() => setPicker(`moa-ref-model:${index}`)}>{slot.model}</ValueButton>
                  <Button
                    disabled={currentMoaPreset.reference_models.length <= 1}
                    onClick={() =>
                      updateMoaPreset(prev => ({
                        ...prev,
                        reference_models: prev.reference_models.filter((_, i) => i !== index)
                      }))
                    }
                    size="sm"
                    variant="ghost"
                  >
                    {m.moaRemove}
                  </Button>
                </div>
              }
              className={cn(slot.enabled === false && 'opacity-60')}
              description={
                <span className="font-mono text-[0.68rem]">
                  {slot.provider} · {slot.model || t.settings.model}
                </span>
              }
              key={`${selectedMoaPreset}-${index}`}
              title={m.moaReference(index + 1)}
            />
          ))}

          <Button
            className="mb-2"
            onClick={() =>
              updateMoaPreset(prev => ({
                ...prev,
                reference_models: [...prev.reference_models, { ...prev.aggregator, enabled: true }]
              }))
            }
            size="sm"
            variant="text"
          >
            {m.moaAddReference}
          </Button>

          <Row
            below={
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <ValueButton onClick={() => setPicker('moa-agg-provider')}>
                  {moaSlotProviderOptions.find(p => p.slug === currentMoaPreset.aggregator.provider)?.name ??
                    currentMoaPreset.aggregator.provider}
                </ValueButton>
                <ValueButton onClick={() => setPicker('moa-agg-model')}>{currentMoaPreset.aggregator.model}</ValueButton>
              </div>
            }
            description={
              <span className="font-mono text-[0.68rem]">
                {currentMoaPreset.aggregator.provider} · {currentMoaPreset.aggregator.model}
              </span>
            }
            title={m.moaAggregator}
          />
        </>
      )}

      <PickerSheet onClose={() => setPicker(null)} onPick={handlePick} open={picker !== null} options={pickerOptions} value={pickerValue} />
    </div>
  )
}
