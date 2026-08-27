export type StellarAddress = string;
export type EscrowId = string;
export type TxHash = string;

export interface EscrowParams {
  depositor: StellarAddress;
  beneficiary: StellarAddress;
  amountXLM: string;
  tokenAddress?: StellarAddress;
  deadlineBlocks?: number;
}

export interface EscrowState {
  id: EscrowId;
  params: EscrowParams;
  status: 'pending' | 'active' | 'released' | 'disputed' | 'cancelled';
  contractEscrowId?: number;
  txHash?: TxHash;
  createdAt: number;
}

export interface DisputeParams {
  escrowId: EscrowId;
  reason: string;
  evidence?: string;
}

export type SDKResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Parameters for paginated gig listing. All fields are optional —
 * omitting `cursor` starts from the most recent page.
 */
export interface GetGigsParams {
  /** Opaque cursor returned by a previous `getGigs` call to fetch the next page. */
  cursor?: string;
  /** Maximum records to return per page. Capped at 100 by the backend. Defaults to 20. */
  limit?: number;
  /** Filter by escrow status. */
  status?: EscrowState['status'];
  /** Filter by depositor Stellar address. */
  depositor?: StellarAddress;
  /** Filter by beneficiary Stellar address. */
  beneficiary?: StellarAddress;
}

/**
 * A single page of gigs returned by `getGigs`.
 */
export interface GigsPage {
  /** Gig records for this page. */
  data: EscrowState[];
  /**
   * Cursor to pass as `cursor` on the next `getGigs` call.
   * `null` when this is the last page.
   */
  nextCursor: string | null;
  /** Whether another page exists after this one. */
  hasMore: boolean;
}
