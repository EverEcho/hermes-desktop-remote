import { useStore } from '@nanostores/react'
import { useState } from 'react'

import { LOCALE_OPTIONS, useI18n } from '@/i18n'
import { cn } from '@/ui/utils'

import { $themeMode, setThemeMode, type ThemeMode } from '../theme-store'
import { Caption, PickerSheet, Row, SectionHeading, ValueButton } from '../ui'

export function AppearancePage() {
  const { t, locale, setLocale } = useI18n()
  const a = t.settings.appearance
  const mode = useStore($themeMode)
  const [localePicker, setLocalePicker] = useState(false)

  const modes: ThemeMode[] = ['light', 'dark', 'system']

  return (
    <div>
      <Caption className="mb-2">{a.intro}</Caption>

      <SectionHeading title={a.colorMode} />
      <Caption className="mb-2">{a.colorModeDesc}</Caption>
      <div className="flex gap-1 rounded-lg bg-(--ui-bg-quaternary) p-0.5">
        {modes.map(option => (
          <button
            className={cn(
              'flex-1 rounded-md px-2.5 py-1.5 text-(--conversation-text-font-size) transition-colors',
              mode === option
                ? 'bg-(--ui-bg-card) text-(--ui-text-primary) font-medium shadow-xs'
                : 'text-(--ui-text-tertiary)'
            )}
            key={option}
            onClick={() => setThemeMode(option)}
            type="button"
          >
            {a.modeOptions[option]}
          </button>
        ))}
      </div>

      <SectionHeading title={a.language} />
      <Caption className="mb-2">{a.languageDesc}</Caption>
      <Row
        action={
          <ValueButton onClick={() => setLocalePicker(true)}>
            {LOCALE_OPTIONS.find(option => option.id === locale)?.label ?? locale}
          </ValueButton>
        }
        title={a.language}
      />

      <PickerSheet
        onClose={() => setLocalePicker(false)}
        onPick={value => setLocale(value)}
        open={localePicker}
        options={LOCALE_OPTIONS.map(option => ({ value: option.id, label: option.label }))}
        value={locale}
      />
    </div>
  )
}
