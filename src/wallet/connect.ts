import type { WalletConnection, WalletType } from './types';
import { getFreighter } from './freighter';
import { TrustFlowError } from '../errors';

export async function connectWallet(type: WalletType = 'freighter'): Promise<WalletConnection> {
  if (type === 'freighter') {
    const freighter = getFreighter();
    if (!freighter) {
      throw new TrustFlowError('Freighter not installed', 'UNAUTHORIZED');
    }
    const publicKey = await freighter.getPublicKey();
    const network = await freighter.getNetwork();
    return { type: 'freighter', publicKey, network };
  }
  throw new TrustFlowError(`Wallet type ${type} not supported`, 'UNAUTHORIZED');
}

export async function disconnectWallet(): Promise<void> {
  // Most Stellar wallets don't have a disconnect API — clear local state only
}
