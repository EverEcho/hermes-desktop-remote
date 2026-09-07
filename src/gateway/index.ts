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
  $pendingMcpSetup,
  $terminalOutputs,
  onGatewayEvent,
  restorePendingSessionInputs,
  resolveApproval,
  resolveClarification,
  resolveClarificationBatch,
  resolveSecret,
  resolveSudo,
  resolveMcpSetup,
  startEventRouter,
  stopEventRouter,
  type ApprovalRequest,
  type ClarifyRequest,
  type SecretRequest,
  type SudoRequest,
  type McpSetupRequest,
  type TerminalOutput
} from './event-router'
