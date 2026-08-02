import { type ConnectionState, JsonRpcGatewayClient } from '@hermes/shared'
import { atom } from 'nanostores'

import { getWsTicket, $authState } from '@/auth'
import { getGatewayBaseUrl, setActiveProfile } from './http-client'
import { gatewayTargetHeaders } from './request-url'

export class MobileGateway extends JsonRpcGatewayClient {
  constructor() {
    super({
      closedErrorMessage: 'Gateway connection closed',
      connectErrorMessage: 'Could not connect to gateway',
      createRequestId: nextId => nextId,
      notConnectedErrorMessage: 'Gateway is not connected',
      requestTimeoutMs: 30_000
    })
  }
}

export type MobileConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'error'
  | 'auth-required'

export const $connectionState = atom<MobileConnectionState>('idle')
export const $gateway = atom<MobileGateway | null>(null)

let gateway: MobileGateway | null = null
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let wantOpen = false

const MAX_RECONNECT_DELAY_MS = 15_000

export function getGateway(): MobileGateway | null {
  return gateway
}

export async function connectGateway(profile?: string): Promise<void> {
  if (profile) {
    setActiveProfile(profile)
  }

  const authState = $authState.get()

  if (authState.status !== 'authenticated') {
    $connectionState.set('auth-required')

    return
  }

  wantOpen = true
  reconnectAttempt = 0

  if (gateway?.connectionState === 'open') {
    return
  }

  await doConnect()
}

async function doConnect(): Promise<void> {
  const authState = $authState.get()

  if (authState.status !== 'authenticated') {
    $connectionState.set('auth-required')

    return
  }

  $connectionState.set(reconnectAttempt > 0 ? 'reconnecting' : 'connecting')

  try {
    const baseUrl = getGatewayBaseUrl()

    if (!baseUrl) {
      throw new Error('No gateway URL configured')
    }

    let wsUrl: string

    if (authState.authMode === 'oauth') {
      const ticket = await getWsTicket(baseUrl)
      const wsBase = baseUrl.replace(/^http/, 'ws')
      wsUrl = `${wsBase}/api/ws?ticket=${encodeURIComponent(ticket)}`
    } else if (authState.authMode === 'token') {
      const { loadSessionToken } = await import('@/auth/token-store')
      const token = await loadSessionToken()

      if (!token) {
        $connectionState.set('auth-required')

        return
      }

      const wsBase = baseUrl.replace(/^http/, 'ws')
      wsUrl = `${wsBase}/api/ws?token=${encodeURIComponent(token)}`
    } else {
      const wsBase = baseUrl.replace(/^http/, 'ws')
      const target = gatewayTargetHeaders(authState.gatewayUrl)['X-Hermes-Gateway-Target']
      wsUrl = `${wsBase}/api/ws${target ? `?__gateway_target=${encodeURIComponent(target)}` : ''}`
    }

    if (!gateway) {
      gateway = new MobileGateway()
      $gateway.set(gateway)

      gateway.onState(state => {
        handleStateChange(state)
      })
    }

    await gateway.connect(wsUrl)
    reconnectAttempt = 0
    $connectionState.set('open')
  } catch (error) {
    if (!wantOpen) {
      return
    }

    const message = error instanceof Error ? error.message : ''

    if (/auth|401|403|expired/i.test(message)) {
      $connectionState.set('auth-required')

      return
    }

    $connectionState.set('error')
    scheduleReconnect()
  }
}

function handleStateChange(state: ConnectionState): void {
  if (state === 'open') {
    reconnectAttempt = 0
    $connectionState.set('open')
  } else if (state === 'closed' || state === 'error') {
    if (wantOpen) {
      $connectionState.set('reconnecting')
      scheduleReconnect()
    } else {
      $connectionState.set('idle')
    }
  }
}

function scheduleReconnect(): void {
  if (!wantOpen || reconnectTimer !== null) {
    return
  }

  const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** Math.min(reconnectAttempt, 4))
  reconnectAttempt += 1

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void doConnect()
  }, delay)
}

export function disconnectGateway(): void {
  wantOpen = false

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  gateway?.close()
  $connectionState.set('idle')
}

export async function reconnectGateway(): Promise<void> {
  reconnectAttempt = 0

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  gateway?.close()
  await doConnect()
}

export function switchProfile(profile: string): void {
  setActiveProfile(profile)
  reconnectAttempt = 0

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  gateway?.close()
  void doConnect()
}
