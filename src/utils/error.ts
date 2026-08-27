export class TrustFlowSDKError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: unknown,
  ) {
    super(message);
    this.name = 'TrustFlowSDKError';
  }
}

export function wrapError(e: unknown, code: string): TrustFlowSDKError {
  const msg = e instanceof Error ? e.message : String(e);
  return new TrustFlowSDKError(msg, code, e);
}

export const ErrorCodes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  CONTRACT_ERROR: 'CONTRACT_ERROR',
  TIMEOUT: 'TIMEOUT',
} as const;
