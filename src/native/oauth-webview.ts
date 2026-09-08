import { Capacitor, registerPlugin } from '@capacitor/core'

interface OAuthWebViewPlugin {
  close(): Promise<void>
  open(options: { authorizeUrl: string; redirectUri: string }): Promise<{ url: string }>
}

const OAuthWebView = registerPlugin<OAuthWebViewPlugin>('OAuthWebView')

export function supportsEmbeddedLoopbackOAuth(): boolean {
  const platform = Capacitor.getPlatform()
  return platform === 'ios' || platform === 'android'
}

/**
 * The native view intercepts this exact URL before attempting a network
 * request. A live localhost server is therefore not required on mobile while
 * the Gateway still receives an RFC 8252 loopback redirect URI.
 */
export function createEmbeddedLoopbackRedirectUri(): string {
  const bytes = crypto.getRandomValues(new Uint16Array(1))
  const port = 49_152 + (bytes[0] % 16_384)
  return `http://127.0.0.1:${port}/oauth/callback`
}

export async function openEmbeddedLoopbackOAuth(authorizeUrl: string, redirectUri: string): Promise<string> {
  if (!supportsEmbeddedLoopbackOAuth()) {
    throw new Error('Embedded loopback OAuth is unavailable on this platform')
  }

  const result = await OAuthWebView.open({ authorizeUrl, redirectUri })
  if (!result.url) throw new Error('OAuth callback did not include a URL')
  return result.url
}

export async function closeEmbeddedLoopbackOAuth(): Promise<void> {
  if (!supportsEmbeddedLoopbackOAuth()) return
  await OAuthWebView.close().catch(() => {})
}
