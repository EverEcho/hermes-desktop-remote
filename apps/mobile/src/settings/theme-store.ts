import { atom } from 'nanostores'

export type ThemeMode = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'rhermes.mobile.theme'

function storedMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)

    if (value === 'light' || value === 'dark' || value === 'system') {
      return value
    }
  } catch {
    // storage unavailable
  }

  return 'system'
}

export const $themeMode = atom<ThemeMode>(storedMode())

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function applyThemeMode(): void {
  const mode = $themeMode.get()
  const dark = mode === 'dark' || (mode === 'system' && (media?.matches ?? false))

  document.documentElement.classList.toggle('dark', dark)
}

export function setThemeMode(mode: ThemeMode): void {
  $themeMode.set(mode)

  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // storage unavailable
  }

  applyThemeMode()
}

export function initThemeMode(): void {
  applyThemeMode()
  media?.addEventListener('change', () => {
    if ($themeMode.get() === 'system') {
      applyThemeMode()
    }
  })
}
