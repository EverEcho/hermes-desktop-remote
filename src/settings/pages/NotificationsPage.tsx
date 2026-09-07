import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { Button } from '@/ui/Button'

import { BellIcon } from '../icons'
import { Caption, SectionHeading, ToggleRow } from '../ui'

const STORAGE_KEY = 'rhermes.mobile.notifications'

export const NOTIFICATION_KINDS = ['approval', 'input', 'turnDone', 'turnError', 'backgroundDone', 'credits'] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

interface NotifyPrefs {
  enabled: boolean
  kinds: Record<NotificationKind, boolean>
}

const DEFAULT_PREFS: NotifyPrefs = {
  enabled: true,
  kinds: { approval: true, backgroundDone: true, credits: true, input: true, turnDone: true, turnError: true }
}

function loadPrefs(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotifyPrefs>

      return {
        enabled: parsed.enabled !== false,
        kinds: { ...DEFAULT_PREFS.kinds, ...(parsed.kinds ?? {}) }
      }
    }
  } catch {
    // storage unavailable
  }

  return DEFAULT_PREFS
}

export function getNotifyPrefs(): NotifyPrefs {
  return loadPrefs()
}

export function NotificationsPage() {
  const { t } = useI18n()
  const n = t.settings.notifications
  const [prefs, setPrefs] = useState<NotifyPrefs>(loadPrefs)
  const [testNote, setTestNote] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
      // storage unavailable
    }
  }, [prefs])

  const runTest = async () => {
    if (!('Notification' in window)) {
      setTestNote(n.testUnsupported)

      return
    }

    let permission = Notification.permission

    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }

    if (permission === 'granted') {
      new Notification(t.settings.about.heading, { body: n.testSent })
      setTestNote(n.testSent)
    } else {
      setTestNote(n.testUnsupported)
    }
  }

  return (
    <div>
      <SectionHeading icon={BellIcon} title={t.settings.nav.notifications} />
      <Caption className="mb-2">{n.intro}</Caption>

      <ToggleRow
        checked={prefs.enabled}
        description={n.enableAllDesc}
        label={n.enableAll}
        onChange={on => setPrefs(prev => ({ ...prev, enabled: on }))}
      />

      {NOTIFICATION_KINDS.map(kind => (
        <ToggleRow
          checked={prefs.enabled && prefs.kinds[kind]}
          description={n.kinds[kind].description}
          disabled={!prefs.enabled}
          key={kind}
          label={n.kinds[kind].label}
          onChange={on => setPrefs(prev => ({ ...prev, kinds: { ...prev.kinds, [kind]: on } }))}
        />
      ))}

      <div className="mt-4">
        <Button onClick={() => void runTest()} size="sm" variant="outline">
          {n.test}
        </Button>
        {testNote && <Caption className="mt-2">{testNote}</Caption>}
      </div>
    </div>
  )
}
