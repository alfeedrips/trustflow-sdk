import { Keypair, xdr } from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../src/client';
import {
  cancelEscrow,
  getEscrow,
  filterUnreleasedMilestones,
  encodeMilestoneIndices,
} from '../src/escrow/cancel';
import { buildCancelArgs } from '../src/contract/build';
import { TrustFlowError } from '../src/errors';

const CALLER = Keypair.random().publicKey();
const client = {} as TrustFlowClient;

describe('filterUnreleasedMilestones', () => {
  it('returns empty array when escrow has no milestones', () => {
    expect(filterUnreleasedMilestones([])).toEqual([]);
    expect(filterUnreleasedMilestones({ milestones: [] })).toEqual([]);
  });

  it('returns all indices when all milestones are unreleased', () => {
    const milestones = [
      { index: 0, released: false },
      { index: 1, released: false },
      { index: 2, released: false },
    ];
    expect(filterUnreleasedMilestones(milestones)).toEqual([0, 1, 2]);
  });

  it('filters out released milestones and keeps only unreleased indices', () => {
    const milestones = [
      { index: 0, released: true },
      { index: 1, released: false },
      { index: 2, released: true },
      { index: 3, released: false },
    ];
    expect(filterUnreleasedMilestones(milestones)).toEqual([1, 3]);
  });

  it('deduplicates repeated indices', () => {
    const milestones = [
      { index: 1, released: false },
      { index: 1, released: false },
    ];
    expect(filterUnreleasedMilestones(milestones)).toEqual([1]);
  });
});

describe('encodeMilestoneIndices and buildCancelArgs', () => {
  it('encodes indices into a Vec<u32> ScVal', () => {
    const encoded = encodeMilestoneIndices([0, 2]) as xdr.ScVal;
    expect(encoded.switch().name).toBe('scvVec');
    const vec = encoded.vec();
    expect(vec).toHaveLength(2);
    expect(vec![0].u32()).toBe(0);
    expect(vec![1].u32()).toBe(2);
  });

  it('buildCancelArgs encodes escrowId and unreleased milestone indices', () => {
    const args = buildCancelArgs('escrow-1', [1, 3]) as xdr.ScVal[];
    expect(args).toHaveLength(2);
    expect(args[0].switch().name).toBe('scvString');
    expect(args[0].str().toString()).toBe('escrow-1');
    expect(args[1].switch().name).toBe('scvVec');
    const vec = args[1].vec();
    expect(vec).toHaveLength(2);
    expect(vec![0].u32()).toBe(1);
    expect(vec![1].u32()).toBe(3);
  });

  it('rejects invalid/negative milestone indices with VALIDATION_ERROR', () => {
    expect(() => encodeMilestoneIndices([-1])).toThrow(TrustFlowError);
    expect(() => buildCancelArgs('escrow-1', [-1])).toThrow(TrustFlowError);
  });
});

describe('cancelEscrow', () => {
  it('resolves with a transaction identifier for valid input', async () => {
    const txId = await cancelEscrow(client, 'escrow-1', CALLER);

    expect(typeof txId).toBe('string');
    expect(txId.length).toBeGreaterThan(0);
  });

  it('forwards encoded call arguments to invokeContract for escrows with milestones', async () => {
    const invokeContract = jest.fn().mockResolvedValue('tx_cancel_123');
    const mockClient = {
      invokeContract,
      readContract: jest.fn(),
    } as unknown as TrustFlowClient;

    const milestones = [
      { index: 0, released: true },
      { index: 1, released: false },
      { index: 2, released: false },
    ];

    const txId = await cancelEscrow(mockClient, 'escrow-1', CALLER, milestones);

    expect(txId).toBe('tx_cancel_123');
    expect(invokeContract).toHaveBeenCalledTimes(1);
    const [method, args] = invokeContract.mock.calls[0];
    expect(method).toBe('cancel_escrow');
    expect(args).toHaveLength(2);
    expect(args[0].str().toString()).toBe('escrow-1');
    const vec = args[1].vec();
    expect(vec).toHaveLength(2);
    expect(vec![0].u32()).toBe(1);
    expect(vec![1].u32()).toBe(2);
  });

  it('handles an escrow with all milestones unreleased', async () => {
    const invokeContract = jest.fn().mockResolvedValue('tx_cancel_all');
    const mockClient = { invokeContract } as unknown as TrustFlowClient;

    const milestones = [
      { index: 0, released: false },
      { index: 1, released: false },
    ];

    await cancelEscrow(mockClient, 'escrow-1', CALLER, milestones);

    const [, args] = invokeContract.mock.calls[0];
    const vec = args[1].vec();
    expect(vec).toHaveLength(2);
    expect(vec![0].u32()).toBe(0);
    expect(vec![1].u32()).toBe(1);
  });

  it('handles an escrow with no milestones', async () => {
    const invokeContract = jest.fn().mockResolvedValue('tx_cancel_none');
    const mockClient = { invokeContract } as unknown as TrustFlowClient;

    await cancelEscrow(mockClient, 'escrow-1', CALLER, []);

    const [, args] = invokeContract.mock.calls[0];
    const vec = args[1].vec();
    expect(vec).toHaveLength(0);
  });

  it('rejects a missing escrowId with a validation error', async () => {
    const promise = cancelEscrow(client, '', CALLER);

    await expect(promise).rejects.toBeInstanceOf(TrustFlowError);
    await expect(promise).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a missing caller with an unauthorized error', async () => {
    await expect(cancelEscrow(client, 'escrow-1', '')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('getEscrow', () => {
  it('resolves for a provided escrowId', async () => {
    await expect(getEscrow(client, 'escrow-1')).resolves.toBeNull();
  });

  it('rejects a missing escrowId with a not-found error', async () => {
    const promise = getEscrow(client, '');

    await expect(promise).rejects.toBeInstanceOf(TrustFlowError);
    await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
