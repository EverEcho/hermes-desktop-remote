import { describe, expect, it } from 'vitest'

import { normalizeRuntimePlatform, resolveAppSurface } from './runtime'

describe('app surface resolution', () => {
  it('always uses the desktop surface in Tauri', () => {
    expect(resolveAppSurface({ desktopLike: false, platform: 'tauri' })).toBe('desktop')
  })

  it('always uses the mobile surface in Capacitor mobile shells', () => {
    expect(resolveAppSurface({ desktopLike: true, platform: 'ios' })).toBe('mobile')
    expect(resolveAppSurface({ desktopLike: true, platform: 'android' })).toBe('mobile')
  })

  it('lets an explicit browser override win over screen capability', () => {
    expect(resolveAppSurface({ desktopLike: false, platform: 'web', surfaceOverride: 'desktop' })).toBe('desktop')
  })

  it('uses the persisted browser preference before automatic detection', () => {
    expect(resolveAppSurface({ desktopLike: false, platform: 'web', savedSurface: 'desktop' })).toBe('desktop')
  })

  it('detects a browser surface only at bootstrap', () => {
    expect(resolveAppSurface({ desktopLike: true, platform: 'web' })).toBe('desktop')
    expect(resolveAppSurface({ desktopLike: false, platform: 'web' })).toBe('mobile')
  })

  it('normalizes unknown Capacitor platforms to web', () => {
    expect(normalizeRuntimePlatform('electron')).toBe('web')
  })
})
