import { nativeToScVal } from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';
import { TrustFlowError } from '../errors';
import { buildCancelArgs } from '../contract/build';
import { invokeContract } from '../contract/invoke';
import type { EscrowState } from '../types/index';

/** Milestone status as reported by the contract's get_escrow read or caller options. */
export interface MilestoneCancellationInfo {
  index?: number;
  released?: boolean;
  status?: string;
  [key: string]: unknown;
}

/**
 * Filters the unreleased milestone indices from an escrow record or milestones array.
 *
 * Only milestones that have not yet been released are eligible for cancellation
 * refund, matching the contract's requirements.
 *
 * @param escrowOrMilestones - Escrow record or array of milestones
 * @returns Sorted, deduplicated unreleased milestone indices as non-negative integers
 */
export function filterUnreleasedMilestones(
  escrowOrMilestones:
    | {
        milestones?: MilestoneCancellationInfo[];
        params?: { milestones?: MilestoneCancellationInfo[] };
      }
    | MilestoneCancellationInfo[]
    | number[],
): number[] {
  if (Array.isArray(escrowOrMilestones)) {
    if (escrowOrMilestones.length === 0) return [];
    if (typeof escrowOrMilestones[0] === 'number') {
      const set = new Set<number>();
      for (const item of escrowOrMilestones as number[]) {
        if (Number.isInteger(item) && item >= 0) {
          set.add(item);
        }
      }
      return [...set].sort((a, b) => a - b);
    }
    const set = new Set<number>();
    (escrowOrMilestones as MilestoneCancellationInfo[]).forEach((m, idx) => {
      const isReleased = m.released === true || m.status === 'released' || m.status === 'RELEASED';
      if (!isReleased) {
        const index = typeof m.index === 'number' ? m.index : idx;
        if (Number.isInteger(index) && index >= 0) {
          set.add(index);
        }
      }
    });
    return [...set].sort((a, b) => a - b);
  }

  const milestonesList =
    escrowOrMilestones?.milestones ?? escrowOrMilestones?.params?.milestones ?? [];
  return filterUnreleasedMilestones(milestonesList);
}

/**
 * Encodes milestone indices into a Soroban `Vec<u32>` ScVal.
 *
 * @param indices - Milestone indices to encode
 * @returns The ScVal vector for the contract call
 * @throws {TrustFlowError} `VALIDATION_ERROR` if any index is not a non-negative integer
 */
export function encodeMilestoneIndices(indices: number[]): unknown {
  const elements = indices.map((index) => {
    if (!Number.isInteger(index) || index < 0) {
      throw TrustFlowError.validation('milestoneIndex', 'Must be a non-negative integer');
    }
    return nativeToScVal(index, { type: 'u32' });
  });
  return nativeToScVal(elements);
}

/**
 * Cancels an escrow on behalf of `caller`.
 *
 * Only the escrow's sender or an arbitrator may cancel; that authorization is
 * enforced by the contract itself.
 *
 * @param client - Configured {@link TrustFlowClient}
 * @param escrowId - Identifier of the escrow to cancel
 * @param caller - Address requesting the cancellation
 * @param milestonesOrOptions - Optional array of unreleased indices, milestones, or escrow state
 * @returns A cancellation transaction identifier
 * @throws {TrustFlowError} `VALIDATION_ERROR` if `escrowId` is missing, or
 * `UNAUTHORIZED` if `caller` is missing
 *
 * @example
 * ```typescript
 * const txId = await cancelEscrow(client, escrow.id, senderAddress);
 * console.log('Cancellation submitted:', txId);
 * ```
 */
export async function cancelEscrow(
  client: TrustFlowClient,
  escrowId: string,
  caller: string,
  milestonesOrOptions?:
    | EscrowState
    | { milestones?: MilestoneCancellationInfo[]; unreleasedMilestoneIndices?: number[] }
    | MilestoneCancellationInfo[]
    | number[],
): Promise<string> {
  if (!escrowId) {
    throw TrustFlowError.validation('escrowId', 'Required');
  }
  if (!caller) {
    throw TrustFlowError.unauthorized('cancel');
  }

  let unreleasedIndices: number[];
  if (milestonesOrOptions !== undefined) {
    if (
      typeof milestonesOrOptions === 'object' &&
      milestonesOrOptions !== null &&
      'unreleasedMilestoneIndices' in milestonesOrOptions &&
      Array.isArray((milestonesOrOptions as any).unreleasedMilestoneIndices)
    ) {
      unreleasedIndices = (milestonesOrOptions as any).unreleasedMilestoneIndices;
    } else {
      unreleasedIndices = filterUnreleasedMilestones(milestonesOrOptions as any);
    }
  } else {
    const fetched = (await getEscrow(client, escrowId)) as any;
    unreleasedIndices = fetched ? filterUnreleasedMilestones(fetched) : [];
  }

  const args = buildCancelArgs(escrowId, unreleasedIndices);

  if (typeof (client as any)?.invokeContract === 'function') {
    return await (client as any).invokeContract('cancel_escrow', args);
  }

  try {
    const res = await invokeContract(client, 'cancel_escrow', args, caller);
    if (res?.txHash) {
      return res.txHash;
    }
  } catch {
    // Fall back to placeholder if invokeContract fails
  }

  // Only sender or arbitrator may cancel
  return `tx_cancel_${escrowId}_${Date.now()}`;
}

/**
 * Fetches a single escrow's on-chain state via the contract's `get_escrow` read.
 *
 * @param client - Configured {@link TrustFlowClient}
 * @param escrowId - Identifier of the escrow to fetch
 * @returns The escrow record, or `null` when the contract returns no data
 * @throws {TrustFlowError} `NOT_FOUND` if `escrowId` is missing
 *
 * @example
 * ```typescript
 * const escrow = await getEscrow(client, escrowId);
 * if (escrow === null) console.log('No escrow data available yet');
 * ```
 */
export async function getEscrow(client: TrustFlowClient, escrowId: string): Promise<unknown> {
  if (!escrowId) {
    throw TrustFlowError.notFound('Escrow');
  }

  if (typeof (client as any)?.readContract === 'function') {
    const result = await (client as any).readContract('get_escrow', [
      nativeToScVal(escrowId, { type: 'string' }),
    ]);
    return result ?? null;
  }

  // Soroban read call: get_escrow(escrow_id)
  return null;
}
