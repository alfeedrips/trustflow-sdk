import { SorobanRpc } from '@stellar/stellar-sdk';
import { SOROBAN_RPC_URLS } from '../constants';
import type { TrustFlowClient } from '../client';
import { TrustFlowError } from '../errors';

export interface SimulationResult {
  success: boolean;
  cost: { cpuInsns: string; memBytes: string };
  returnValue?: unknown;
  error?: string;
}

export async function simulateContractCall(
  client: TrustFlowClient,
  xdr: string,
): Promise<SimulationResult> {
  const server = new SorobanRpc.Server(SOROBAN_RPC_URLS[client.network]);
  try {
    const result = await server.simulateTransaction({
      toEnvelope: () => ({ toXDR: () => xdr }),
    } as any);
    if (SorobanRpc.Api.isSimulationError(result)) {
      return { success: false, cost: { cpuInsns: '0', memBytes: '0' }, error: result.error };
    }
    return {
      success: true,
      cost: {
        cpuInsns: String(result.cost?.cpuInsns ?? 0),
        memBytes: String(result.cost?.memBytes ?? 0),
      },
    };
  } catch (e) {
    throw new TrustFlowError('Simulation failed', 'SIMULATION_ERROR', e);
  }
}
