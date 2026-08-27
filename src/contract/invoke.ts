import { SorobanRpc, Contract } from '@stellar/stellar-sdk';
import { SOROBAN_RPC_URLS } from '../constants';
import type { TrustFlowClient } from '../client';

export async function invokeContract(
  client: TrustFlowClient,
  method: string,
  args: unknown[],
  caller: string,
): Promise<unknown> {
  const rpcUrl = SOROBAN_RPC_URLS[client.network];
  const server = new SorobanRpc.Server(rpcUrl);
  const contract = new Contract(client.contractId);
  const account = await server.getAccount(caller);
  // Build and simulate the invocation
  const operation = contract.call(method, ...(args as any[]));
  return { operation, account, server };
}
