import { atom } from 'nanostores'
import * as api from '@/gateway/api'
import type { ProfileInfo } from '@/types/hermes'

const PROFILE_TAG_SATURATION = 68
const PROFILE_TAG_LIGHTNESS = 58

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

export function profileColor(name: null | string | undefined): null | string {
  const key = (name ?? '').trim()
  if (!key || key === 'default') {
    return null
  }
  const hue = hashString(key) % 360
  return `hsl(${hue} ${PROFILE_TAG_SATURATION}% ${PROFILE_TAG_LIGHTNESS}%)`
}

export function resolveProfileColor(name: null | string | undefined, overrides: Record<string, string>): null | string {
  const key = (name ?? '').trim()
  if (!key || key === 'default') {
    return null
  }
  return overrides[key] ?? profileColor(key)
}

export const PROFILE_SWATCHES: readonly string[] = Array.from(
  { length: 12 },
  (_, index) => `hsl(${index * 30} ${PROFILE_TAG_SATURATION}% ${PROFILE_TAG_LIGHTNESS}%)`
)

export function profileColorSoft(color: string, percent = 18): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}

// 缓存 profiles 列表
export const $profiles = atom<ProfileInfo[]>([])

// 用户自定义颜色映射
function loadStoredColors(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('rhermes.profileColors')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const $profileColors = atom<Record<string, string>>(loadStoredColors())

export function setProfileColor(name: string, color: string | null): void {
  const current = { ...$profileColors.get() }
  if (color) {
    current[name] = color
  } else {
    delete current[name]
  }
  $profileColors.set(current)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('rhermes.profileColors', JSON.stringify(current))
    } catch {
      // ignore
    }
  }
}

let refreshPromise: Promise<ProfileInfo[]> | null = null

export async function refreshProfiles(): Promise<ProfileInfo[]> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await api.getProfiles()
      const list = res?.profiles || []
      $profiles.set(list)
      return list
    } catch {
      return $profiles.get()
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}
