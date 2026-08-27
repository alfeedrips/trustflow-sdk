import { useState, useEffect } from 'react';
import type { TrustFlowClient } from '../client';

export function useBalance(client: TrustFlowClient, address: string | null) {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    client
      .getBalance(address)
      .then((b) => {
        if (!cancelled) {
          setBalance(b);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, address]);

  return { balance, loading, error };
}
