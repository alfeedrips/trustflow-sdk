import type { TrustFlowClient } from '../client';
import { TrustFlowError } from '../errors';

export async function submitTransaction(
  client: TrustFlowClient,
  signedXdr: string,
): Promise<string> {
  const server = client.getServer();
  try {
    const result = await server.submitTransaction(
      (await import('@stellar/stellar-sdk')).TransactionBuilder.fromXDR(
        signedXdr,
        client.network === 'MAINNET'
          ? (await import('@stellar/stellar-sdk')).Networks.PUBLIC
          : (await import('@stellar/stellar-sdk')).Networks.TESTNET,
      ),
    );
    return (result as any).hash;
  } catch (e: any) {
    throw new TrustFlowError(
      e?.response?.data?.extras?.result_codes?.transaction ?? 'Submission failed',
      'CONTRACT_ERROR',
      e,
    );
  }
}
