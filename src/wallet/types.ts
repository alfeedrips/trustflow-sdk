export type WalletType = 'freighter' | 'albedo' | 'xbull' | 'manual';

export interface WalletConnection {
  type: WalletType;
  publicKey: string;
  network: string;
}

export interface WalletAdapter {
  type: WalletType;
  isAvailable(): Promise<boolean>;
  connect(): Promise<WalletConnection>;
  sign(xdr: string, network: string): Promise<string>;
  disconnect(): Promise<void>;
}
