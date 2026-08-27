export interface FreighterWallet {
  isAvailable(): boolean;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string, opts: { network: string }): Promise<{ signedXDR: string }>;
  getNetwork(): Promise<string>;
}

export function getFreighter(): FreighterWallet | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = (window as any).freighter;
  if (!w) {
    return null;
  }
  return {
    isAvailable: () => true,
    getPublicKey: () => w.getPublicKey(),
    signTransaction: (xdr, opts) => w.signTransaction(xdr, opts),
    getNetwork: () => w.getNetwork(),
  };
}

export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }
  await new Promise((r) => setTimeout(r, 100));
  return !!(window as any).freighter;
}
