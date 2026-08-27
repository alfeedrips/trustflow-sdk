export interface ContractConfig {
  contractId: string;
  network: 'TESTNET' | 'MAINNET';
  rpcUrl: string;
  networkPassphrase: string;
  apiBaseUrl?: string;
  apiKey?: string;
}

export interface InvokeContractParams {
  method: string;
  args: unknown[];
  source: string;
  fee?: number;
}

export interface ContractCallResult {
  success: boolean;
  returnValue?: unknown;
  txHash?: string;
  errorCode?: number;
  gasUsed?: number;
}
