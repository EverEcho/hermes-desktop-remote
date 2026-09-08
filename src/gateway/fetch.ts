import { isTauriPlatform } from '@/native'

/**
 * Tauri's webview is subject to browser CORS and Private Network Access
 * preflights. Gateway requests must use the Rust HTTP client on desktop so
 * user-configured LAN gateways behave like they did behind Electron's net API.
 */
export async function gatewayFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  if (isTauriPlatform()) {
    const { fetch } = await import('@tauri-apps/plugin-http')
    return fetch(input, init)
  }

  return globalThis.fetch(input, init)
}
