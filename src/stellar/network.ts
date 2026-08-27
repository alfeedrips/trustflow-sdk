export type StellarNetwork = 'TESTNET' | 'MAINNET';

export const NETWORK_CONFIGS: Record<
  StellarNetwork,
  { horizonUrl: string; rpcUrl: string; passphrase: string }
> = {
  TESTNET: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  MAINNET: {
    horizonUrl: 'https://horizon.stellar.org',
    rpcUrl: 'https://soroban.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
};

export function getNetworkConfig(network: StellarNetwork) {
  return NETWORK_CONFIGS[network];
}
