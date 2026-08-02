import type { SessionInfo, SessionMessage } from './hermes'

export type MobileConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'error'
  | 'auth-required'

export interface MobileGatewayConfig {
  url: string
  authMode: 'oauth' | 'token'
  profile?: string
}

export interface MobileSession extends SessionInfo {
  runtimeSessionId?: string
  unread?: boolean
}

export interface MobileMessage {
  id: string
  role: SessionMessage['role']
  content: string
  reasoning?: string
  timestamp?: number
  pending?: boolean
  error?: string
  toolCalls?: MobileToolCall[]
  attachments?: MobileAttachment[]
  rowId?: number
}

export interface MobileToolCall {
  id: string
  name: string
  status: 'running' | 'complete' | 'error'
  args?: unknown
  result?: unknown
  summary?: string
  durationS?: number
  inlineDiff?: string
}

export interface MobileAttachment {
  id: string
  name: string
  type: 'image' | 'file'
  dataUrl?: string
  size?: number
}

export interface MobileProfile {
  name: string
  isDefault: boolean
  gatewayUrl?: string
}

export interface MobileComposerState {
  text: string
  attachments: MobileAttachment[]
  model?: string
  provider?: string
  reasoningEffort?: string
  sending: boolean
}
