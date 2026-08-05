export { ApiError, apiRequest, apiUpload, configureHttpClient, getActiveProfile, getGatewayBaseUrl, isAuthError, setActiveProfile } from './http-client'
export {
  $connectionState,
  $gateway,
  connectGateway,
  disconnectGateway,
  getGateway,
  MobileGateway,
  reconnectGateway,
  switchProfile,
  type MobileConnectionState
} from './ws-client'
export {
  $pendingApprovals,
  $pendingClarifications,
  $pendingSecrets,
  $pendingSudo,
  $terminalOutputs,
  onGatewayEvent,
  resolveApproval,
  resolveClarification,
  resolveSecret,
  resolveSudo,
  startEventRouter,
  stopEventRouter,
  type ApprovalRequest,
  type ClarifyRequest,
  type SecretRequest,
  type SudoRequest,
  type TerminalOutput
} from './event-router'
