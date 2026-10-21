import type { WalletConnection, WalletType } from './types';
import { isWalletRejection } from './types';
import { getFreighter } from './freighter';
import { getAlbedo } from './albedo';
import { TrustFlowError } from '../errors';

/** Albedo names the public network `public` or `pubnet`; the SDK calls it `MAINNET`. */
function normalizeAlbedoNetwork(name: string): string {
  const upper = name.toUpperCase();
  return upper === 'PUBLIC' || upper === 'PUBNET' ? 'MAINNET' : upper;
}

/**
 * Attempts to establish a connection with the specified Stellar wallet.
 * If the user rejects the connection dialog, a retryable TrustFlowError with
 * code 'USER_REJECTED' is thrown, leaving the connection state clean for subsequent attempts.
 */
export async function connectWallet(type: WalletType = 'freighter'): Promise<WalletConnection> {
  if (type === 'freighter') {
    const freighter = getFreighter();
    if (!freighter) {
      throw new TrustFlowError('Freighter not installed', 'UNAUTHORIZED');
    }
    try {
      const publicKey = await freighter.getPublicKey();
      if (!publicKey) {
        throw TrustFlowError.userRejected('User rejected Freighter connection');
      }
      const network = await freighter.getNetwork();
      return { type: 'freighter', publicKey, network: network || 'TESTNET' };
    } catch (e: unknown) {
      if (isWalletRejection(e)) {
        throw TrustFlowError.userRejected(
          e instanceof Error ? e.message : 'User rejected Freighter connection',
          e,
        );
      }
      if (e instanceof TrustFlowError) throw e;
      throw TrustFlowError.wrap(e, 'UNAUTHORIZED');
    }
  }

  if (type === 'albedo') {
    const albedo = getAlbedo();
    if (!albedo) {
      throw new TrustFlowError('Albedo not available', 'UNAUTHORIZED');
    }
    try {
      const res = await albedo.publicKey();
      if (!res?.pubkey) {
        throw TrustFlowError.userRejected('User rejected Albedo connection');
      }
      // Same fallback as the Freighter path when the wallet does not report a network.
      const network = res.network ? normalizeAlbedoNetwork(res.network) : 'TESTNET';
      return { type: 'albedo', publicKey: res.pubkey, network };
    } catch (e: unknown) {
      if (isWalletRejection(e)) {
        throw TrustFlowError.userRejected(
          e instanceof Error ? e.message : 'User rejected Albedo connection',
          e,
        );
      }
      if (e instanceof TrustFlowError) throw e;
      throw TrustFlowError.wrap(e, 'UNAUTHORIZED');
    }
  }

  throw new TrustFlowError(`Wallet type ${type} not supported`, 'UNAUTHORIZED');
}

export async function disconnectWallet(): Promise<void> {
  // Most Stellar wallets don't have a disconnect API — clear local state only
}
