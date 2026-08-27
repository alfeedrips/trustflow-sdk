const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;
const XLM_AMOUNT_RE = /^\d+(\.\d{1,7})?$/;

export function isValidStellarAddress(value: string): boolean {
  return STELLAR_ADDRESS_RE.test(value);
}

export function isValidXLMAmount(value: string): boolean {
  if (!XLM_AMOUNT_RE.test(value)) {
    return false;
  }
  const n = parseFloat(value);
  return n > 0 && n <= 500_000_000;
}

export function assertStellarAddress(value: string, field = 'address'): void {
  if (!isValidStellarAddress(value)) {
    throw new Error(`Invalid Stellar address for "${field}": ${value}`);
  }
}

export function xlmToStroops(xlm: string): bigint {
  const parts = xlm.split('.');
  const whole = BigInt(parts[0]) * 10_000_000n;
  const frac = parts[1] ? BigInt(parts[1].padEnd(7, '0').slice(0, 7)) : 0n;
  return whole + frac;
}

export function isValidEscrowId(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function isValidBase64(value: string): boolean {
  return (
    typeof value === 'string' && value.length > 0 && value.length % 4 === 0 && BASE64_RE.test(value)
  );
}

export function isValidBlockCount(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 1_000_000;
}

export function sanitizeString(value: string, maxLength = 256): string {
  return value
    .replace(/[<>"']/g, '')
    .trim()
    .slice(0, maxLength);
}
