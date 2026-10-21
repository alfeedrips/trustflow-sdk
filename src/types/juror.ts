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

/**
 * Result of creating a vote commitment.
 *
 * Note: Commit-reveal voting only supports binary decisions (true for depositor,
 * false for beneficiary) matching the contract `hash_vote` specification.
 * It cannot represent 'abstain'. Callers needing an 'abstain' vote must cast
 * a plaintext vote instead.
 */
export interface VoteCommitment {
  /** 32-byte SHA-256 commitment hash matching contract sha256(vote_byte ++ 32_byte_salt) */
  commitment: Uint8Array;
  /** 32-byte cryptographically secure secret salt */
  salt: Uint8Array;
  /** Hex-encoded string of the 32-byte commitment hash */
  commitmentHex: string;
  /** Hex-encoded string of the 32-byte salt */
  saltHex: string;
  /** Base64-encoded commitment string, suitable for EncryptedVote.ciphertext */
  ciphertext: string;
  /** The vote choice: true if voting for depositor, false if voting for beneficiary. Note: cannot be 'abstain'. */
  voteForDepositor: boolean;
}

/**
 * Result of constructing or verifying a reveal vote payload.
 *
 * Note: Commit-reveal voting only supports binary decisions (true for depositor,
 * false for beneficiary) matching the contract `hash_vote` specification.
 * It cannot represent 'abstain'. Callers needing an 'abstain' vote must cast
 * a plaintext vote instead.
 */
export interface RevealVoteResult {
  /** The vote choice: true if voting for depositor, false if voting for beneficiary. Note: cannot be 'abstain'. */
  voteForDepositor: boolean;
  /** Numerical vote byte: 1 for depositor, 0 for beneficiary */
  voteByte: number;
  /** The 32-byte secret salt */
  salt: Uint8Array;
  /** Hex-encoded string of the 32-byte salt */
  saltHex: string;
  /** The reconstructed 32-byte commitment hash */
  commitment: Uint8Array;
  /** Hex-encoded string of the reconstructed commitment hash */
  commitmentHex: string;
}

/**
 * Parameters for revealing a previously committed vote on-chain.
 */
export interface SubmitRevealParams {
  /** ID of the dispute being revealed. */
  disputeId: EscrowId;
  /** Stellar address of the revealing juror. */
  jurorAddress: StellarAddress;
  /** The original vote choice: true for depositor, false for beneficiary. Cannot be 'abstain'. */
  voteForDepositor: boolean;
  /** The 32-byte secret salt used during commitment creation (Uint8Array or 64-char hex string). */
  salt: Uint8Array | string;
}

/**
 * Result of submitting a vote reveal on-chain.
 */
export interface SubmitRevealResult {
  txHash: TxHash;
  disputeId: EscrowId;
  jurorAddress: StellarAddress;
  voteForDepositor: boolean;
}

export type SubmitRevealSDKResult = SDKResult<SubmitRevealResult>;

/**
 * Configuration options for JurorClient in-memory salt caching.
 */
export interface JurorClientOptions {
  /** Maximum number of salts retained before evicting the oldest entry. */
  maxStoredSalts?: number;
  /** Lifetime of each stored salt in milliseconds; expired entries are evicted. */
  saltTtlMs?: number;
}
