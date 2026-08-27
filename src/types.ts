import type { IPFSConfig } from './storage';

export type Network = 'TESTNET' | 'MAINNET';

export interface ClientConfig {
  network?: Network;
  contractId: string;
  rpcUrl?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  /** Optional configuration for the built-in `storage.upload()` IPFS helper. */
  ipfs?: IPFSConfig;
}

export enum EscrowStatus {
  Pending = 'PENDING',
  Active = 'ACTIVE',
  Released = 'RELEASED',
  Disputed = 'DISPUTED',
  Cancelled = 'CANCELLED',
}

export interface Escrow {
  id: string;
  sender: string;
  recipient: string;
  amount: bigint;
  status: EscrowStatus;
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, string>;
}

export interface CreateEscrowParams {
  sender: string;
  recipient: string;
  amountStroops: bigint;
  durationBlocks?: number;
  metadata?: Record<string, string>;
}

export interface ReleaseEscrowParams {
  escrowId: string;
  caller: string;
}

export interface DisputeEscrowParams {
  escrowId: string;
  caller: string;
  reason: string;
}
