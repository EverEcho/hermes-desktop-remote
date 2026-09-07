import { isNativePlatform } from '@/native'

/**
 * In H5 development, keep the configured Gateway URL for display/storage but
 * send requests through Vite's same-origin proxy. Native builds must always
 * use the real Gateway URL.
 */
export function resolveGatewayRequestUrl(gatewayUrl: string): string {
  const normalized = gatewayUrl.replace(/\/+$/, '')

  if (!import.meta.env.DEV || isNativePlatform() || typeof window === 'undefined') {
    return normalized
  }

  try {
    const configured = new URL(normalized)

    if (configured.origin !== window.location.origin) {
      return window.location.origin
    }
  } catch {
    return normalized
  }

  return normalized
}

export function gatewayTargetHeaders(gatewayUrl: string): Record<string, string> {
  if (!import.meta.env.DEV || isNativePlatform()) return {}

  return { 'X-Hermes-Gateway-Target': gatewayUrl.replace(/\/+$/, '') }
}
