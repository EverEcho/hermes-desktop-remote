export type RuntimePlatform = 'android' | 'ios' | 'tauri' | 'web'

export type AppSurface = 'desktop' | 'mobile'

export interface SurfaceResolutionInput {
  desktopLike: boolean
  platform: RuntimePlatform
  savedSurface?: string | null
  surfaceOverride?: string | null
}

/**
 * Select the UI once during bootstrap. A desktop browser that is subsequently
 * resized into a narrow viewport deliberately remains on the desktop surface:
 * switching a mounted app would discard drafts, streams, and pane state.
 */
export function resolveAppSurface({
  desktopLike,
  platform,
  savedSurface,
  surfaceOverride
}: SurfaceResolutionInput): AppSurface {
  if (platform === 'tauri') return 'desktop'
  if (platform === 'ios' || platform === 'android') return 'mobile'

  if (surfaceOverride === 'desktop' || surfaceOverride === 'mobile') {
    return surfaceOverride
  }

  if (savedSurface === 'desktop' || savedSurface === 'mobile') {
    return savedSurface
  }

  return desktopLike ? 'desktop' : 'mobile'
}

export function normalizeRuntimePlatform(value: string): RuntimePlatform {
  if (value === 'tauri' || value === 'ios' || value === 'android') {
    return value
  }

  return 'web'
}

export function isDesktopLikeBrowser(windowLike: Pick<Window, 'matchMedia'>): boolean {
  return windowLike.matchMedia('(min-width: 768px) and (pointer: fine)').matches
}
