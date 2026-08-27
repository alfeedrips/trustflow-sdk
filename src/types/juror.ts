import type { StellarAddress, EscrowId, TxHash, SDKResult } from './index';

/** A juror's decision on a dispute. */
export type VoteChoice = 'approve' | 'reject' | 'abstain';

/** A vote cast in the open, readable directly from the ledger. */
export interface PlaintextVote {
  encrypted: false;
  choice: VoteChoice;
}

/**
 * A vote cast as ciphertext (e.g. a commit-reveal scheme), so the choice
 * stays hidden until the dispute's reveal phase. The SDK does not perform
 * encryption itself — `ciphertext` must already be base64-encoded by the
 * caller's chosen scheme before it reaches `JurorClient.vote`.
 */
export interface EncryptedVote {
  encrypted: true;
  /** Base64-encoded ciphertext of the juror's choice. */
  ciphertext: string;
}

export type VotePayload = PlaintextVote | EncryptedVote;

export interface CastVoteParams {
  /** ID of the dispute being voted on. */
  disputeId: EscrowId;
  /** Stellar address of the voting juror. */
  jurorAddress: StellarAddress;
  /** The vote itself, either plaintext or encrypted. */
  vote: VotePayload;
}

export interface CastVoteResult {
  txHash: TxHash;
  disputeId: EscrowId;
  jurorAddress: StellarAddress;
  encrypted: boolean;
}

export type CastVoteSDKResult = SDKResult<CastVoteResult>;
