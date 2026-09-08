import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Keyboard } from '@capacitor/keyboard'
import { Network } from '@capacitor/network'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export function isMobileNativePlatform(): boolean {
  const platform = Capacitor.getPlatform()
  return platform === 'ios' || platform === 'android'
}

export function isTauriPlatform(): boolean {
  return Capacitor.getPlatform() === 'tauri'
}

/* External links open in a popup browser (Capacitor in-app browser sheet on
 * native, new tab on H5) instead of redirecting the app's own webview. */
export async function openExternalUrl(url: string): Promise<void> {
  if (Capacitor.getPlatform() === 'tauri') {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
      return
    } catch {
      // fall through to the browser implementation
    }
  }

  if (isNativePlatform()) {
    try {
      await Browser.open({ url })
      return
    } catch {
      // fall through to window.open
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function initializeNativeAdapters(): Promise<void> {
  if (!isMobileNativePlatform()) {
    return
  }

  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0d0d0e' })
  } catch {
    // not critical
  }

  try {
    await Keyboard.setResizeMode({ mode: 'body' as never })
  } catch {
    // not critical
  }
}

export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  if (!isMobileNativePlatform()) {
    return
  }

  try {
    const impactStyle =
      style === 'heavy' ? ImpactStyle.Heavy : style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light
    await Haptics.impact({ style: impactStyle })
  } catch {
    // not critical
  }
}

export async function hapticNotification(type: 'success' | 'warning' | 'error'): Promise<void> {
  if (!isMobileNativePlatform()) {
    return
  }

  try {
    const notificationType =
      type === 'error'
        ? NotificationType.Error
        : type === 'warning'
          ? NotificationType.Warning
          : NotificationType.Success
    await Haptics.notification({ type: notificationType })
  } catch {
    // not critical
  }
}

export function onAppStateChange(callback: (isActive: boolean) => void): () => void {
  let removed = false

  const listenerPromise = App.addListener('appStateChange', ({ isActive }) => {
    if (!removed) {
      callback(isActive)
    }
  })

  return () => {
    removed = true
    void listenerPromise.then(listener => listener.remove())
  }
}

export function onNetworkChange(callback: (connected: boolean) => void): () => void {
  let removed = false

  const listenerPromise = Network.addListener('networkStatusChange', status => {
    if (!removed) {
      callback(status.connected)
    }
  })

  return () => {
    removed = true
    void listenerPromise.then(listener => listener.remove())
  }
}

export function onKeyboardHeightChange(callback: (height: number) => void): () => void {
  if (!isMobileNativePlatform()) {
    return () => {}
  }

  let removed = false

  const listenerPromise = Keyboard.addListener('keyboardDidShow', (info) => {
    if (!removed) {
      callback(info.keyboardHeight)
    }
  })

  return () => {
    removed = true
    void listenerPromise.then(listener => listener.remove())
  }
}
