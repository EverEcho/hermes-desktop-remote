import { useStore } from '@nanostores/react'

import { version } from '../../package.json'
import { $authState } from '@/auth'
import { $connectionState } from '@/gateway'
import { $currentModel, $currentProvider } from '@/sessions/store'
import { BottomSheet } from '@/ui/BottomSheet'
import { LOCALE_OPTIONS, useI18n } from '@/i18n'
import { cn } from '@/ui/utils'

interface MobileSettingsModalProps {
  open: boolean
  onClose: () => void
}

export function MobileSettingsModal({ open, onClose }: MobileSettingsModalProps) {
  const { t, locale, setLocale } = useI18n()
  const authState = useStore($authState)
  const connectionState = useStore($connectionState)
  const model = useStore($currentModel)
  const provider = useStore($currentProvider)

  return (
    <BottomSheet open={open} onClose={onClose} title={t.settings.title}>
      <div className="py-1">
        <SettingsRow label={t.settings.gateway} value={authState.status === 'authenticated' ? authState.gatewayUrl : '—'} />
        <SettingsRow label={t.settings.auth} value={authState.status === 'authenticated' ? authState.authMode : '—'} />
        <SettingsRow label={t.settings.profile} value={authState.status === 'authenticated' ? authState.profile : '—'} />
        <SettingsRow label={t.settings.connection} value={connectionState} />
        <SettingsRow label={t.settings.model} value={model || t.settings.default} />
        <SettingsRow label={t.settings.provider} value={provider || t.settings.default} />

        <div className="flex items-center justify-between py-2.5 min-h-[2.5rem]">
          <span className="text-(--conversation-text-font-size) text-(--ui-text-secondary)">{t.settings.language}</span>
          <div className="flex gap-1 rounded-lg bg-(--ui-bg-quaternary) p-0.5">
            {LOCALE_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => setLocale(option.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-(--conversation-tool-font-size) transition-colors',
                  locale === option.id
                    ? 'bg-(--ui-bg-card) text-(--ui-text-primary) font-medium shadow-xs'
                    : 'text-(--ui-text-tertiary)'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-(--ui-stroke-tertiary)">
          <p className="text-(--conversation-tool-font-size) text-(--ui-text-quaternary)">
            {t.settings.version(version)}
          </p>
        </div>
      </div>
    </BottomSheet>
  )
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 min-h-[2.5rem]">
      <span className="text-(--conversation-text-font-size) text-(--ui-text-secondary)">{label}</span>
      <span className="text-(--conversation-text-font-size) text-(--ui-text-tertiary) truncate max-w-[58%] text-right font-mono">
        {value}
      </span>
    </div>
  )
}
