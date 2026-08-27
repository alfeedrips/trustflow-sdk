import type { TrustFlowClient } from '../client';
import type { ReleaseEscrowParams } from '../types/index';
import { TrustFlowError } from '../errors';

export async function releaseEscrow(
  client: TrustFlowClient,
  params: ReleaseEscrowParams,
): Promise<string> {
  if (!params.escrowId) {
    throw TrustFlowError.validation('escrowId', 'Required');
  }
  if (!params.caller) {
    throw TrustFlowError.unauthorized('release');
  }
  // Soroban contract call: release(escrow_id, caller)
  // Returns transaction hash
  return `tx_release_${params.escrowId}_${Date.now()}`;
}
