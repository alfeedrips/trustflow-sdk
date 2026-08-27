const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;
const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;

export function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_RE.test(address);
}

export function isValidContractId(id: string): boolean {
  return CONTRACT_ID_RE.test(id);
}

export function isPositiveAmount(value: string): boolean {
  const n = Number(value);
  return !isNaN(n) && n > 0 && isFinite(n);
}

export function assertValidAddress(address: string, field: string): void {
  if (!isValidStellarAddress(address)) {
    throw new Error(`Invalid Stellar address for field "${field}"`);
  }
}
