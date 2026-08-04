import { useEffect, useMemo, useRef, useState } from 'react'

import * as api from '@/gateway/api'
import { useI18n } from '@/i18n'
import type { ConfigFieldSchema, HermesConfigRecord } from '@/types/hermes'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { cn } from '@/ui/utils'

import { fieldDescription, fieldLabel, FREE_INPUT_KEYS } from '../constants'
import { enumOptionsFor, getNested, sectionFieldEntries, setNested, voiceFieldVisible } from '../helpers'
import { Caption, ErrorNote, PickerSheet, Row, ToggleRow, ValueButton } from '../ui'

interface ConfigSectionPageProps {
  sectionId: string
}

export function ConfigSectionPage({ sectionId }: ConfigSectionPageProps) {
  const { t } = useI18n()
  const c = t.settings.config

  const [config, setConfig] = useState<HermesConfigRecord | null>(null)
  const [schema, setSchema] = useState<Record<string, ConfigFieldSchema> | null>(null)
  const [failed, setFailed] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [pickerKey, setPickerKey] = useState<string | null>(null)
  const [listKey, setListKey] = useState<string | null>(null)

  const saveTimer = useRef<number | null>(null)
  const saveVersion = useRef(0)

  useEffect(() => {
    let cancelled = false

    Promise.all([api.getConfigRecord(), api.getConfigSchema()])
      .then(([record, schemaResponse]) => {
        if (cancelled) {
          return
        }

        setConfig(record)
        setSchema(schemaResponse.fields ?? {})
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
      }
    },
    []
  )

  const updateConfig = (next: HermesConfigRecord) => {
    setConfig(next)
    setSaveError('')

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }

    const version = ++saveVersion.current

    saveTimer.current = window.setTimeout(() => {
      void api
        .saveConfig(next)
        .catch(err => {
          if (saveVersion.current === version) {
            setSaveError(err instanceof Error ? err.message : c.autosaveFailed)
          }
        })
    }, 550)
  }

  const fields = useMemo(() => {
    if (!schema || !config) {
      return []
    }

    const all = sectionFieldEntries(schema, config).get(sectionId) ?? []

    return sectionId === 'voice' ? all.filter(([key]) => voiceFieldVisible(key, config)) : all
  }, [schema, config, sectionId])

  if (failed) {
    return (
      <div className="py-8 space-y-3 text-center">
        <Caption>{c.failedLoad}</Caption>
        <Button
          className="mx-auto"
          onClick={() => {
            setFailed(false)
            void Promise.all([api.getConfigRecord(), api.getConfigSchema()])
              .then(([record, schemaResponse]) => {
                setConfig(record)
                setSchema(schemaResponse.fields ?? {})
              })
              .catch(() => setFailed(true))
          }}
          size="sm"
          variant="secondary"
        >
          {t.common.retry}
        </Button>
      </div>
    )
  }

  if (!config || !schema) {
    return <Caption className="py-8 text-center">{t.common.loading}</Caption>
  }

  if (fields.length === 0) {
    return (
      <div className="py-8 text-center">
        <Caption>{c.emptyDesc}</Caption>
      </div>
    )
  }

  const pickerOptions = pickerKey ? (enumOptionsFor(pickerKey, getNested(config, pickerKey), config) ?? []).map(option => ({ value: option, label: option || t.settings.default })) : []

  return (
    <div>
      <ErrorNote>{saveError}</ErrorNote>
      <div>
        {fields.map(([key, field]) => (
          <ConfigFieldRow
            config={config}
            field={field}
            key={key}
            onOpenList={() => setListKey(key)}
            onOpenPicker={() => setPickerKey(key)}
            onUpdate={value => updateConfig(setNested(config, key, value))}
            schemaKey={key}
            value={getNested(config, key)}
          />
        ))}
      </div>

      <PickerSheet
        onClose={() => setPickerKey(null)}
        onPick={value => {
          if (pickerKey) {
            updateConfig(setNested(config, pickerKey, value))
          }
        }}
        open={pickerKey !== null}
        options={pickerOptions}
        value={pickerKey ? String(getNested(config, pickerKey) ?? '') : ''}
      />

      <ListEditor
        hint={c.listHint}
        onClose={() => setListKey(null)}
        onSave={value => {
          if (listKey) {
            updateConfig(
              setNested(
                config,
                listKey,
                value
                  .split('\n')
                  .map(line => line.trim())
                  .filter(Boolean)
              )
            )
          }
        }}
        open={listKey !== null}
        value={listKey && Array.isArray(getNested(config, listKey)) ? (getNested(config, listKey) as unknown[]).map(String) : []}
      />
    </div>
  )
}

function ConfigFieldRow({
  schemaKey,
  field,
  value,
  config,
  onUpdate,
  onOpenPicker,
  onOpenList
}: {
  schemaKey: string
  field: ConfigFieldSchema
  value: unknown
  config: HermesConfigRecord
  onUpdate: (value: unknown) => void
  onOpenPicker: () => void
  onOpenList: () => void
}) {
  const { t, locale } = useI18n()
  const label = fieldLabel(schemaKey, locale)
  const description = fieldDescription(schemaKey, locale) ?? field.description

  if (field.type === 'boolean' || typeof value === 'boolean') {
    return <ToggleRow checked={value === true} description={description} label={label} onChange={on => onUpdate(on)} />
  }

  const enumOptions = field.type === 'select' ? (field.options?.map(String) ?? enumOptionsFor(schemaKey, value, config)) : enumOptionsFor(schemaKey, value, config)

  if (enumOptions && !FREE_INPUT_KEYS.has(schemaKey)) {
    return (
      <Row
        action={<ValueButton onClick={onOpenPicker}>{value === undefined || value === '' ? t.settings.default : String(value)}</ValueButton>}
        description={description}
        title={label}
      />
    )
  }

  if (field.type === 'list' || Array.isArray(value)) {
    const count = Array.isArray(value) ? value.length : 0

    return (
      <Row
        action={
          <span className="rounded-md bg-(--ui-bg-quaternary) px-2 py-1 text-(--conversation-caption-font-size) text-(--ui-text-tertiary)">
            {count}
          </span>
        }
        description={description}
        onClick={onOpenList}
        title={label}
      />
    )
  }

  if (field.type === 'number' || typeof value === 'number') {
    return <NumberRow description={description} label={label} onUpdate={onUpdate} value={value} />
  }

  return <TextRow description={description} label={label} onUpdate={onUpdate} value={value} />
}

function NumberRow({ label, description, value, onUpdate }: { label: string; description?: string; value: unknown; onUpdate: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value ?? ''))

  useEffect(() => {
    setDraft(String(value ?? ''))
  }, [value])

  const commit = () => {
    const parsed = Number(draft)

    if (!Number.isNaN(parsed) && parsed !== value) {
      onUpdate(parsed)
    } else {
      setDraft(String(value ?? ''))
    }
  }

  return (
    <Row
      action={
        <Input
          className="w-24 text-right font-mono"
          inputMode="decimal"
          onBlur={commit}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
          type="number"
          value={draft}
        />
      }
      description={description}
      title={label}
    />
  )
}

function TextRow({ label, description, value, onUpdate }: { label: string; description?: string; value: unknown; onUpdate: (v: string) => void }) {
  const [draft, setDraft] = useState(typeof value === 'string' ? value : value == null ? '' : String(value))

  useEffect(() => {
    setDraft(typeof value === 'string' ? value : value == null ? '' : String(value))
  }, [value])

  const commit = () => {
    if (draft !== (value ?? '')) {
      onUpdate(draft)
    }
  }

  return (
    <Row
      action={
        <Input
          className="w-40 max-w-[50%] text-right"
          onBlur={commit}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
          value={draft}
        />
      }
      description={description}
      title={label}
    />
  )
}

function ListEditor({ open, onClose, onSave, value, hint }: { open: boolean; onClose: () => void; onSave: (text: string) => void; value: string[]; hint: string }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(value.join('\n'))
    }
  }, [open, value])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end md:justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:w-auto md:min-w-[24rem] rounded-t-xl md:rounded-xl border border-(--stroke-nous) shadow-(--shadow-nous) bg-(--ui-bg-elevated) p-4 pb-[calc(1rem+var(--safe-area-bottom))]">
        <Caption className="mb-2">{hint}</Caption>
        <textarea
          className={cn(
            'w-full h-40 rounded-[var(--btn-radius)] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) p-2.5',
            'text-(--conversation-text-font-size) text-(--ui-text-primary) font-mono outline-none resize-none'
          )}
          onChange={event => setDraft(event.target.value)}
          value={draft}
        />
        <div className="mt-3 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              onSave(draft)
              onClose()
            }}
          >
            {t.common.save}
          </Button>
          <Button className="flex-1" onClick={onClose} variant="secondary">
            {t.common.close}
          </Button>
        </div>
      </div>
    </div>
  )
}
