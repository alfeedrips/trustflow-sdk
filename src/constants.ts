import type { Network } from './types';

export const DEFAULT_NETWORK: Network = 'TESTNET';

export const HORIZON_URLS: Record<Network, string> = {
  TESTNET: 'https://horizon-testnet.stellar.org',
  MAINNET: 'https://horizon.stellar.org',
};

export const SOROBAN_RPC_URLS: Record<Network, string> = {
  TESTNET: 'https://soroban-testnet.stellar.org',
  MAINNET: 'https://soroban.stellar.org',
};

export const ESCROW_MIN_AMOUNT_STROOPS = 1_000_000n; // 0.1 XLM
export const ESCROW_MAX_DURATION_BLOCKS = 1_000_000;
export const SDK_VERSION = '0.2.0';
