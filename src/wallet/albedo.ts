import type { Network } from '../types';
import { TrustFlowError } from '../errors';
import { NETWORK_CONFIGS } from '../stellar/network';
import {
  verifySignedEnvelope,
  type SignableTransaction,
  type SignedTransaction,
  type SignWithFreighterOptions,
} from '../stellar/signing';
import { isWalletRejection } from './types';

export interface AlbedoWallet {
  /**
   * `network` is the network the wallet is currently on (e.g. `public` or
   * `testnet`). It is optional because not every Albedo build reports it.
   */
  publicKey(params?: { token?: string }): Promise<{
    pubkey: string;
    token: string;
    network?: string;
  }>;
  tx(params: {
    xdr: string;
    network?: string;
  }): Promise<{ signed_envelope_xdr: string; tx_hash: string }>;
}

interface AlbedoWindow {
  albedo?: AlbedoWallet;
}

declare const window: AlbedoWindow | undefined;

export function getAlbedo(): AlbedoWallet | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window?.albedo ?? null;
}

/** Albedo names the networks differently from the SDK. */
const ALBEDO_NETWORKS: Partial<Record<Network, string>> = {
  TESTNET: 'testnet',
  MAINNET: 'public',
};

/**
 * Signs `transaction` with the injected Albedo wallet and verifies the answer
 * before returning it (#345). Plain and fee-bump transactions are both
 * supported: the full envelope is sent, so a fee-bump keeps its fee-bump
 * envelope type and the returned XDR can be submitted to Horizon as-is.
 *
 * @param transaction - The transaction to sign
 * @param network - Network the transaction was built for; Albedo must support it
 * @param options - Optional `expectedSigner` public key to verify
 * @returns The signed envelope XDR and its hash
 * @throws {TrustFlowError} `UNAUTHORIZED` when Albedo is not installed,
 *   `USER_REJECTED` when the user declines, and `SIGNING_ERROR` for an unsupported
 *   network or a response that does not verify
 *
 * @example
 * ```typescript
 * const { xdr } = await signWithAlbedo(feeBumpTx, 'TESTNET');
 * await server.submitTransaction(TransactionBuilder.fromXDR(xdr, Networks.TESTNET));
 * ```
 */
export async function signWithAlbedo(
  transaction: SignableTransaction,
  network: Network,
  options: SignWithFreighterOptions = {},
): Promise<SignedTransaction> {
  const albedo = getAlbedo();
  if (!albedo) {
    throw new TrustFlowError('Albedo not available', 'UNAUTHORIZED');
  }

  const albedoNetwork = ALBEDO_NETWORKS[network];
  if (!albedoNetwork) {
    throw TrustFlowError.signingFailed(`Albedo cannot sign transactions on ${network}`);
  }
  if (transaction.networkPassphrase !== NETWORK_CONFIGS[network].passphrase) {
    throw TrustFlowError.signingFailed(
      `transaction was built for a different network than ${network}`,
    );
  }

  let signedXDR: string;
  try {
    const res = await albedo.tx({
      xdr: transaction.toEnvelope().toXDR('base64'),
      network: albedoNetwork,
    });
    signedXDR = res.signed_envelope_xdr;
  } catch (e) {
    if (isWalletRejection(e)) {
      throw TrustFlowError.userRejected(
        e instanceof Error ? e.message : 'User rejected Albedo signing',
        e,
      );
    }
    throw TrustFlowError.signingFailed(e instanceof Error ? e.message : String(e), e);
  }

  return verifySignedEnvelope(transaction, signedXDR, options.expectedSigner);
}
