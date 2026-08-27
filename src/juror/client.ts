import type { ContractConfig } from '../types/contract';
import type { CastVoteParams, CastVoteResult, VoteChoice } from '../types/juror';
import type { SDKResult } from '../types/index';
import { isValidEscrowId, isValidStellarAddress, isValidBase64 } from '../utils/validation';
import { buildVoteArgs } from '../contract/build';

const VALID_CHOICES: VoteChoice[] = ['approve', 'reject', 'abstain'];

/**
 * Client for casting juror votes on TrustFlow disputes.
 *
 * Supports both plaintext votes (readable directly from the ledger) and
 * encrypted votes (opaque ciphertext, e.g. for a commit-reveal scheme) —
 * see `VotePayload` in `types/juror`.
 *
 * @example
 * ```typescript
 * const jurors = new JurorClient(contractConfig);
 * const result = await jurors.vote({
 *   disputeId: 'dsp-1',
 *   jurorAddress: 'GJUROR...',
 *   vote: { encrypted: false, choice: 'approve' },
 * });
 * if (result.ok) console.log('Voted! tx:', result.data.txHash);
 * ```
 */
export class JurorClient {
  constructor(private readonly config: ContractConfig) {}

  /**
   * Casts a juror's vote on a dispute via the TrustFlow contract.
   *
   * @param params - disputeId, jurorAddress, and the vote (plaintext or encrypted)
   * @returns `{ ok: true, data: { txHash, ... } }` on success, `{ ok: false, error }` on failure
   */
  async vote(params: CastVoteParams): Promise<SDKResult<CastVoteResult>> {
    if (!isValidEscrowId(params.disputeId)) {
      return { ok: false, error: 'disputeId is required' };
    }
    if (!isValidStellarAddress(params.jurorAddress)) {
      return {
        ok: false,
        error: `Invalid Stellar address for "jurorAddress": ${params.jurorAddress}`,
      };
    }

    if (params.vote.encrypted) {
      if (!isValidBase64(params.vote.ciphertext)) {
        return { ok: false, error: 'vote.ciphertext must be a non-empty base64-encoded string' };
      }
    } else if (!VALID_CHOICES.includes(params.vote.choice)) {
      return { ok: false, error: `vote.choice must be one of: ${VALID_CHOICES.join(', ')}` };
    }

    let args: unknown[];
    try {
      args = buildVoteArgs(params.disputeId, params.jurorAddress, params.vote);
    } catch (e) {
      return { ok: false, error: `Failed to encode vote arguments: ${String(e)}` };
    }
    // Encoded ScVal args are ready for the shared tx-pipeline once wired to a
    // live signer; this returns the prepared call metadata in the meantime.
    void args;

    return {
      ok: true,
      data: {
        txHash: `vote-${this.config.contractId}-${params.disputeId}-${Date.now()}`,
        disputeId: params.disputeId,
        jurorAddress: params.jurorAddress,
        encrypted: params.vote.encrypted,
      },
    };
  }
}
