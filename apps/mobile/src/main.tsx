import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { initializeNativeAdapters, onAppStateChange, onNetworkChange, onKeyboardHeightChange } from './native'
import { reconnectGateway } from './gateway'
import { initThemeMode } from './settings/theme-store'
import './styles.css'

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
    <App />
  </StrictMode>
)
