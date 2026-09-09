import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'

import { RootApp } from './bootstrap/RootApp'
import { isDesktopLikeBrowser, normalizeRuntimePlatform, resolveAppSurface } from './bootstrap/runtime'
import { initializeNativeAdapters, onAppStateChange, onNetworkChange, onKeyboardHeightChange } from './native'
import { reconnectGateway } from './gateway'
import { initThemeMode } from './settings/theme-store'
import './styles.css'

const runtimePlatform = normalizeRuntimePlatform(Capacitor.getPlatform())
document.documentElement.dataset.platform = runtimePlatform

const surfaceOverride = new URLSearchParams(window.location.search).get('surface') ?? import.meta.env.VITE_APP_SURFACE
const savedSurface = (() => {
  try {
    return window.localStorage.getItem('rhermes.surface')
  } catch {
    return null
  }
})()
const appSurface = resolveAppSurface({
  desktopLike: isDesktopLikeBrowser(window),
  platform: runtimePlatform,
  savedSurface,
  surfaceOverride
})
document.documentElement.dataset.surface = appSurface

const isStandalone =
  (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches
if (isStandalone) {
  document.documentElement.dataset.standalone = 'true'
}

if (runtimePlatform === 'tauri') {
  document.documentElement.dataset.desktopOs = /Macintosh|Mac OS X/i.test(navigator.userAgent)
    ? 'macos'
    : /Windows/i.test(navigator.userAgent)
      ? 'windows'
      : 'linux'
}

function LifecycleManager() {
  useEffect(() => {
    initThemeMode()
    void initializeNativeAdapters()

    const offAppState = onAppStateChange(isActive => {
      if (isActive) {
        void reconnectGateway()
      }
    })

    const offNetwork = onNetworkChange(connected => {
      if (connected) {
        void reconnectGateway()
      }
    })

    const offKeyboard = onKeyboardHeightChange(height => {
      document.documentElement.style.setProperty('--keyboard-height', `${height}px`)
    })

    return () => {
      offAppState()
      offNetwork()
      offKeyboard()
    }
  }, [])

  return null
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <LifecycleManager />
    <RootApp surface={appSurface} />
  </StrictMode>
)
