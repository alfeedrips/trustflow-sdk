import { getNetworkConfig, StellarNetwork } from './network';

export interface AccountInfo {
  address: string;
  balanceXLM: string;
  sequenceNumber: string;
  isActive: boolean;
}

export async function fetchAccountInfo(
  address: string,
  network: StellarNetwork,
): Promise<AccountInfo> {
  const { horizonUrl } = getNetworkConfig(network);
  try {
    const res = await fetch(`${horizonUrl}/accounts/${address}`);
    if (!res.ok) {
      return { address, balanceXLM: '0', sequenceNumber: '0', isActive: false };
    }
    const data = (await res.json()) as {
      balances: Array<{ asset_type: string; balance: string }>;
      sequence: string;
    };
    const xlm = data.balances?.find((b) => b.asset_type === 'native');
    return {
      address,
      balanceXLM: xlm?.balance ?? '0',
      sequenceNumber: data.sequence,
      isActive: true,
    };
  } catch {
    return { address, balanceXLM: '0', sequenceNumber: '0', isActive: false };
  }
}
