import type { ConfigFieldSchema, HermesConfigRecord } from '@/types/hermes'

import { BUILTIN_PERSONALITIES, ENUM_OPTIONS, PROVIDER_GROUPS, SECTIONS } from './constants'

const POLLUTING_PATH_PARTS = new Set(['__proto__', 'constructor', 'prototype'])

function isSafePart(part: string): boolean {
  return part.length > 0 && !POLLUTING_PATH_PARTS.has(part)
}

function configPathParts(path: string): string[] {
  const parts = path.split('.')

  if (!parts.every(isSafePart)) {
    throw new Error(`Unsafe config path: ${path}`)
  }

  return parts
}

function safeSet(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype' || !key) {
    throw new Error(`Unsafe config key: ${key}`)
  }

  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  })
}

export function getNested(obj: HermesConfigRecord, path: string): unknown {
  let cur: unknown = obj

  for (const part of configPathParts(path)) {
    if (cur == null || typeof cur !== 'object') {
      return undefined
    }

    if (!Object.prototype.hasOwnProperty.call(cur, part)) {
      return undefined
    }

    cur = (cur as Record<string, unknown>)[part]
  }

  return cur
}

export function setNested(obj: HermesConfigRecord, path: string, value: unknown): HermesConfigRecord {
  const clone = structuredClone(obj)
  const parts = configPathParts(path)
  let cur: Record<string, unknown> = clone

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]
    const existing = Object.prototype.hasOwnProperty.call(cur, part) ? cur[part] : undefined

    if (existing == null || typeof existing !== 'object') {
      safeSet(cur, part, {})
    }

    cur = cur[part] as Record<string, unknown>
  }

  safeSet(cur, parts[parts.length - 1], value)

  return clone
}

export function inferFieldSchema(value: unknown): ConfigFieldSchema {
  if (typeof value === 'boolean') {
    return { type: 'boolean' }
  }

  if (typeof value === 'number') {
    return { type: 'number' }
  }

  if (Array.isArray(value)) {
    return { type: 'list' }
  }

  return { type: 'string' }
}

export function sectionFieldEntries(
  schema: Record<string, ConfigFieldSchema>,
  config: HermesConfigRecord
): Map<string, [string, ConfigFieldSchema][]> {
  return new Map(
    SECTIONS.map(section => [
      section.id,
      section.keys.flatMap(key => {
        const value = getNested(config, key)
        const field = schema[key] ?? (value === undefined ? undefined : inferFieldSchema(value))

        return field ? [[key, field] as [string, ConfigFieldSchema]] : []
      })
    ])
  )
}

export function asText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function personalityOptions(config: HermesConfigRecord): string[] {
  const custom = getNested(config, 'agent.personalities')
  const customNames =
    custom && typeof custom === 'object' && !Array.isArray(custom) ? Object.keys(custom as Record<string, unknown>) : []

  return [...new Set(['', ...BUILTIN_PERSONALITIES, ...customNames])]
}

export function enumOptionsFor(key: string, value: unknown, config: HermesConfigRecord): string[] | undefined {
  const opts = key === 'display.personality' ? personalityOptions(config) : ENUM_OPTIONS[key]

  if (!opts) {
    return undefined
  }

  const current = asText(value)

  return current && !opts.includes(current) ? [...opts, current] : opts
}

export function voiceFieldVisible(key: string, config: HermesConfigRecord): boolean {
  const match = /^(tts|stt)\.([^.]+)\./.exec(key)

  if (!match) {
    return true
  }

  const [, domain, provider] = match

  if (domain === 'stt' && !getNested(config, 'stt.enabled')) {
    return false
  }

  return provider === String(getNested(config, `${domain}.provider`) ?? '')
}

export function providerGroup(key: string): string {
  let best: (typeof PROVIDER_GROUPS)[number] | undefined

  for (const candidate of PROVIDER_GROUPS) {
    if (!key.startsWith(candidate.prefix)) {
      continue
    }

    if (!best || candidate.prefix.length > best.prefix.length) {
      best = candidate
    }
  }

  return best?.name ?? 'Other'
}

export const stripToolsetLabel = (label: string): string =>
  label.replace(/^[\p{Emoji}\p{Extended_Pictographic}\s]+/u, '').trim() || label

export const toolsetDisplayLabel = (toolset: { label?: string; name: string }): string =>
  stripToolsetLabel(asText(toolset.label || toolset.name))

export const isFastTier = (tier: unknown): boolean =>
  ['fast', 'priority', 'on'].includes(
    String(tier ?? '')
      .trim()
      .toLowerCase()
  )

export const withActive = (models: readonly string[], active: string): readonly string[] =>
  active && !models.includes(active) ? [active, ...models] : models
