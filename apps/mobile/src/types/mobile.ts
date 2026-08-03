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
  authMode: 'oauth' | 'token' | 'cookie'
  profile?: string
}

export interface MobileSession extends SessionInfo {
  runtimeSessionId?: string
  unread?: boolean
}

export type MobileMessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; reasoning: string }
  | {
      type: 'tool-call'
      id: string
      name: string
      status: 'running' | 'complete' | 'error'
      args?: unknown
      result?: unknown
      summary?: string
      durationS?: number
      inlineDiff?: string
    }

export interface MobileMessage {
  id: string
  role: SessionMessage['role']
  parts: MobileMessagePart[]
  timestamp?: number
  pending?: boolean
  failed?: boolean
  error?: string
  retryText?: string
  retryUserMessageId?: string
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
