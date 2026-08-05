import type { GatewayEvent } from '@hermes/shared'

import { translateNow } from '@/i18n'
import { getNotifyPrefs, type NotificationKind } from '@/settings/pages/NotificationsPage'

import { onGatewayEvent } from './gateway'

function canNotify(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
}

export async function ensureNotificationPermission(): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return
  }

  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission()
    } catch {
      // some webviews throw on programmatic permission requests
    }
  }
}

export function dispatchNotification(kind: NotificationKind, body?: string): void {
  const prefs = getNotifyPrefs()

  if (!prefs.enabled || !prefs.kinds[kind]) {
    return
  }

  // Foreground events already surface as in-app sheets/banners; only notify
  // while the app is backgrounded.
  if (!document.hidden) {
    return
  }

  if (!canNotify()) {
    return
  }

  const t = translateNow()
  const kindCopy = t.settings.notifications.kinds[kind]

  try {
    new Notification(kindCopy.label, { body: body || kindCopy.description, tag: `rhermes-${kind}` })
  } catch {
    // constructor unsupported in this webview — nothing to do
  }
}

let wired = false

export function wireEventNotifications(): void {
  if (wired) {
    return
  }

  wired = true

  onGatewayEvent((event: GatewayEvent) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>

    switch (event.type) {
      case 'approval.request': {
        const body = (payload.command as string) || (payload.description as string)
        dispatchNotification('approval', body)
        break
      }

      case 'clarify.request':
        dispatchNotification('input', payload.question as string | undefined)
        break

      case 'secret.request':
        dispatchNotification('input', payload.env_var as string | undefined)
        break

      case 'sudo.request':
        dispatchNotification('input')
        break

      case 'message.complete':
        dispatchNotification('turnDone')
        break

      case 'error':
        dispatchNotification('turnError', payload.message as string | undefined)
        break

      case 'notification.show': {
        const body = (payload.body as string) || (payload.title as string)
        dispatchNotification('credits', body)
        break
      }

      default:
        break
    }
  })
}
