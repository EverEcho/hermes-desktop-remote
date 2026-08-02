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
  $terminalOutputs,
  onGatewayEvent,
  resolveApproval,
  resolveClarification,
  resolveSecret,
  startEventRouter,
  stopEventRouter,
  type ApprovalRequest,
  type ClarifyRequest,
  type SecretRequest,
  type TerminalOutput
} from './event-router'
