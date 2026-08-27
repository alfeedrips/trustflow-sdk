export interface PreparedTx {
  xdr: string;
  networkPassphrase: string;
  fee: string;
}
export interface SignedTx {
  xdr: string;
  signatures: string[];
}
export interface SubmittedTx {
  hash: string;
  successful: boolean;
  ledger?: number;
}

export async function submitTransaction(xdr: string, horizonUrl: string): Promise<SubmittedTx> {
  const res = await fetch(`${horizonUrl}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(xdr)}`,
  });
  const data = (await res.json()) as {
    hash: string;
    successful: boolean;
    ledger?: number;
    extras?: { result_codes?: { transaction?: string } };
  };
  if (!res.ok) {
    throw new Error(data.extras?.result_codes?.transaction ?? 'Submission failed');
  }
  return { hash: data.hash, successful: data.successful, ledger: data.ledger };
}
