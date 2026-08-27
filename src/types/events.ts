export type TrustFlowEventType =
  | 'escrow.created'
  | 'escrow.released'
  | 'escrow.cancelled'
  | 'dispute.raised'
  | 'dispute.resolved';

export interface TrustFlowEvent<T = unknown> {
  type: TrustFlowEventType;
  escrowId: string;
  payload: T;
  blockNumber: number;
  txHash: string;
  timestamp: number;
}

export type EventHandler<T = unknown> = (event: TrustFlowEvent<T>) => void | Promise<void>;
