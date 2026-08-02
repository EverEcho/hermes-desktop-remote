import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'cn.13bit.rhermes.mobile',
  appName: 'RHermes',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    StatusBar: {
      style: 'dark'
    },
    Browser: {
      presentationStyle: 'fullscreen'
    }
  }
}

export default config
