import { describe, it, expect, beforeEach } from 'vitest'
import { compactNumber } from '@/app/home/HomeCharts'

describe('Home Charts and Compact Numbers', () => {
  it('formats numbers concisely into compact representation', () => {
    expect(compactNumber(0)).toBe('0')
    expect(compactNumber(850)).toBe('850')
    expect(compactNumber(1000)).toBe('1k')
    expect(compactNumber(1500)).toBe('1.5k')
    expect(compactNumber(24000)).toBe('24k')
    expect(compactNumber(1200000)).toBe('1.2M')
    expect(compactNumber(null)).toBe('0')
    expect(compactNumber(undefined)).toBe('0')
  })
})

describe('Home Layout Preferences and Modes', () => {
  const mockStorage: Record<string, string> = {}
  const storage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, val: string) => {
      mockStorage[key] = val
    },
    clear: () => {
      for (const k in mockStorage) delete mockStorage[k]
    }
  }

  beforeEach(() => {
    storage.clear()
  })

  it('persists selected layout mode in storage', () => {
    const KEY = 'hermes_home_layout_mode'
    expect(storage.getItem(KEY)).toBeNull()
    storage.setItem(KEY, 'split')
    expect(storage.getItem(KEY)).toBe('split')
    storage.setItem(KEY, 'minimal')
    expect(storage.getItem(KEY)).toBe('minimal')
    storage.setItem(KEY, 'dashboard')
    expect(storage.getItem(KEY)).toBe('dashboard')
  })
})
