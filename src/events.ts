/**
 * Event parsing utilities for TrustFlow contract events (#40).
 * Parse raw Soroban contract events into typed structures.
 */

export type TrustFlowEventType =
  | 'escrow_created'
  | 'escrow_released'
  | 'escrow_cancelled'
  | 'dispute_raised'
  | 'dispute_resolved'
  | 'milestone_completed';

export interface RawContractEvent {
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  id: string;
  pagingToken: string;
  topic: string[];
  value: string;
}

export interface ParsedEvent<T = Record<string, unknown>> {
  type: TrustFlowEventType;
  contractId: string;
  ledger: number;
  timestamp: string;
  id: string;
  data: T;
}

export interface EscrowCreatedData {
  escrowId: string;
  sender: string;
  recipient: string;
  amount: bigint;
}

export interface EscrowReleasedData {
  escrowId: string;
  recipient: string;
  amount: bigint;
}

export interface DisputeRaisedData {
  escrowId: string;
  raisedBy: string;
  reason: string;
}

/** Decode a Soroban XDR value string to a plain JS string */
function decodeScVal(xdr: string): string {
  // In production, use @stellar/stellar-sdk ScVal.fromXDR().value()
  // This is a lightweight stand-in that handles the common string case.
  try {
    const buf = Buffer.from(xdr, 'base64');
    // ScVal string prefix is 0x0e (ScValType.SCV_STRING)
    if (buf[0] === 0x0e) {
      return buf.slice(5).toString('utf8');
    }
    return xdr;
  } catch {
    return xdr;
  }
}

/** Check whether a raw event belongs to TrustFlow */
export function isTrustFlowEvent(event: RawContractEvent, contractId: string): boolean {
  return event.contractId === contractId && event.type === 'contract';
}

/** Parse a raw Soroban contract event into a typed TrustFlow event */
export function parseEvent(event: RawContractEvent): ParsedEvent | null {
  if (!event.topic || event.topic.length === 0) {
    return null;
  }

  const eventType = decodeScVal(event.topic[0]) as TrustFlowEventType;

  const base = {
    contractId: event.contractId,
    ledger: event.ledger,
    timestamp: event.ledgerClosedAt,
    id: event.id,
  };

  switch (eventType) {
    case 'escrow_created':
      return {
        ...base,
        type: 'escrow_created',
        data: {
          escrowId: decodeScVal(event.topic[1] ?? ''),
          sender: decodeScVal(event.topic[2] ?? ''),
          recipient: decodeScVal(event.topic[3] ?? ''),
          amount: BigInt(decodeScVal(event.value) || '0'),
        } as EscrowCreatedData,
      };

    case 'escrow_released':
      return {
        ...base,
        type: 'escrow_released',
        data: {
          escrowId: decodeScVal(event.topic[1] ?? ''),
          recipient: decodeScVal(event.topic[2] ?? ''),
          amount: BigInt(decodeScVal(event.value) || '0'),
        } as EscrowReleasedData,
      };

    case 'dispute_raised':
      return {
        ...base,
        type: 'dispute_raised',
        data: {
          escrowId: decodeScVal(event.topic[1] ?? ''),
          raisedBy: decodeScVal(event.topic[2] ?? ''),
          reason: decodeScVal(event.value),
        } as DisputeRaisedData,
      };

    default:
      return { ...base, type: eventType, data: {} };
  }
}

/** Parse an array of raw events, filtering nulls and non-TrustFlow events */
export function parseEvents(events: RawContractEvent[], contractId: string): ParsedEvent[] {
  return events
    .filter((e) => isTrustFlowEvent(e, contractId))
    .map(parseEvent)
    .filter((e): e is ParsedEvent => e !== null);
}
