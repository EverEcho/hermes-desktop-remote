import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { en, type Catalog } from './en'
import { detectLocale, LOCALE_OPTIONS, persistLocale } from './languages'
import { zh } from './zh'

const CATALOGS: Record<string, Catalog> = { en, zh }

interface I18nContextValue {
  locale: string
  setLocale: (id: string) => void
  t: Catalog
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: en
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(detectLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((id: string) => {
    if (!CATALOGS[id]) return
    setLocaleState(id)
    persistLocale(id)
  }, [])

  const value = useMemo(
    () => ({ locale, setLocale, t: CATALOGS[locale] ?? en }),
    [locale, setLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}

export { LOCALE_OPTIONS }
export type { Catalog }
