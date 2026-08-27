import { useState, useCallback } from 'react';
import type { WalletConnection, WalletType } from '../wallet/types';
import { connectWallet, disconnectWallet } from '../wallet/connect';

export function useWallet() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (type: WalletType = 'freighter') => {
    setLoading(true);
    setError(null);
    try {
      const w = await connectWallet(type);
      setWallet(w);
      return w;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setWallet(null);
  }, []);

  return { wallet, loading, error, connect, disconnect, isConnected: !!wallet };
}
