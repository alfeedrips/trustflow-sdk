import { SorobanRpc, Contract } from '@stellar/stellar-sdk';
import { SOROBAN_RPC_URLS } from '../constants';
import type { TrustFlowClient } from '../client';

export async function readContractState(
  client: TrustFlowClient,
  method: string,
  args: unknown[] = [],
): Promise<unknown> {
  const rpcUrl = SOROBAN_RPC_URLS[client.network];
  const server = new SorobanRpc.Server(rpcUrl);
  const contract = new Contract(client.contractId);
  const _operation = contract.call(method, ...(args as any[]));
  const result = await server.simulateTransaction({
    toEnvelope: () => ({ toXDR: () => '' }) as any,
  } as any);
  return result;
}
