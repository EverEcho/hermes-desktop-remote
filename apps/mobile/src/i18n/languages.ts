export interface LocaleOption {
  id: string
  label: string
}

/* Mirrors Desktop's LOCALE_OPTIONS shape (apps/desktop/src/i18n/languages.ts),
 * scoped to the locales mobile ships. */
export const LOCALE_OPTIONS: LocaleOption[] = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '简体中文' }
]

export const DEFAULT_LOCALE = 'en'

const STORAGE_KEY = 'rhermes.locale'

export function detectLocale(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && LOCALE_OPTIONS.some(option => option.id === stored)) {
      return stored
    }
  } catch {
    // storage unavailable — fall through to system detection
  }

  const language = (navigator.language || '').toLowerCase()
  if (language.startsWith('zh')) {
    return 'zh'
  }

  return DEFAULT_LOCALE
}

export function persistLocale(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // best effort
  }
}
