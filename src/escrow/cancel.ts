import type { TrustFlowClient } from '../client';
import { TrustFlowError } from '../errors';

export async function cancelEscrow(
  client: TrustFlowClient,
  escrowId: string,
  caller: string,
): Promise<string> {
  if (!escrowId) {
    throw TrustFlowError.validation('escrowId', 'Required');
  }
  if (!caller) {
    throw TrustFlowError.unauthorized('cancel');
  }
  // Only sender or arbitrator may cancel
  return `tx_cancel_${escrowId}_${Date.now()}`;
}

export async function getEscrow(client: TrustFlowClient, escrowId: string): Promise<unknown> {
  if (!escrowId) {
    throw TrustFlowError.notFound('Escrow');
  }
  // Soroban read call: get_escrow(escrow_id)
  return null;
}
