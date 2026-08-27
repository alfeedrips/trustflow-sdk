import type { TrustFlowClient } from '../client';
import type { CreateEscrowParams, Escrow, EscrowStatus } from '../types';
import { TrustFlowError } from '../errors';
import { ESCROW_MIN_AMOUNT_STROOPS } from '../constants';

export async function createEscrow(
  client: TrustFlowClient,
  params: CreateEscrowParams,
): Promise<Escrow> {
  if (params.amountStroops < ESCROW_MIN_AMOUNT_STROOPS) {
    throw TrustFlowError.validation('amountStroops', `Minimum is ${ESCROW_MIN_AMOUNT_STROOPS}`);
  }
  if (!params.sender || !params.recipient) {
    throw TrustFlowError.validation('sender/recipient', 'Both addresses are required');
  }
  // Contract invocation would happen here via src/contract/invoke
  return {
    id: `escrow-${Date.now()}`,
    sender: params.sender,
    recipient: params.recipient,
    amount: params.amountStroops,
    status: 'PENDING' as unknown as EscrowStatus,
    createdAt: Date.now(),
    metadata: params.metadata,
  };
}
