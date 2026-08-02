import { useStore } from '@nanostores/react'

import { $authState } from '@/auth'
import { $connectionState } from '@/gateway'
import { $currentModel, $currentProvider } from '@/sessions/store'
import { BottomSheet } from '@/ui/BottomSheet'

interface MobileSettingsModalProps {
  open: boolean
  onClose: () => void
}

export function MobileSettingsModal({ open, onClose }: MobileSettingsModalProps) {
  const authState = useStore($authState)
  const connectionState = useStore($connectionState)
  const model = useStore($currentModel)
  const provider = useStore($currentProvider)

  return (
    <BottomSheet open={open} onClose={onClose} title="Settings">
      <div className="py-1">
        <SettingsRow label="Gateway" value={authState.status === 'authenticated' ? authState.gatewayUrl : '—'} />
        <SettingsRow label="Auth" value={authState.status === 'authenticated' ? authState.authMode : '—'} />
        <SettingsRow label="Profile" value={authState.status === 'authenticated' ? authState.profile : '—'} />
        <SettingsRow label="Connection" value={connectionState} />
        <SettingsRow label="Model" value={model || 'default'} />
        <SettingsRow label="Provider" value={provider || 'default'} />

        <div className="mt-4 pt-3 border-t border-(--ui-stroke-tertiary)">
          <p className="text-(--conversation-tool-font-size) text-(--ui-text-quaternary)">
            RHermes Mobile v0.1.0
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
