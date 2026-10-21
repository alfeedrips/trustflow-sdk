import { useState, useEffect } from 'react';
import type { TrustFlowClient } from '../client';

/** The outcome of one balance lookup, tagged with the address it was made for. */
interface SettledBalance {
  address: string;
  balance: string | null;
  error: string | null;
}

export function useBalance(client: TrustFlowClient, address: string | null) {
  const [settled, setSettled] = useState<SettledBalance | null>(null);

  useEffect(() => {
    // Drop the previous account's result so it cannot show while the new one loads (#346).
    setSettled(null);
    if (!address) {
      return;
    }
    // Aborting on cleanup makes the response for a previous address a no-op, so an
    // out-of-order response can never overwrite the current account's balance.
    const controller = new AbortController();
    client
      .getBalance(address)
      .then((b) => {
        if (!controller.signal.aborted) {
          setSettled({ address, balance: b, error: null });
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setSettled({ address, balance: null, error: e.message });
        }
      });
    return () => {
      controller.abort();
    };
  }, [client, address]);

  // Only trust a result that belongs to the address being rendered; until it settles,
  // the hook reports loading rather than a balance from a different account.
  const current = settled && settled.address === address ? settled : null;
  return {
    balance: current?.balance ?? null,
    loading: address !== null && current === null,
    error: current?.error ?? null,
  };
}
