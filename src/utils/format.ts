export function stroopsToXLM(stroops: bigint | number): string {
  const s = typeof stroops === 'number' ? BigInt(stroops) : stroops;
  const whole = s / 10_000_000n;
  const frac = s % 10_000_000n;
  return frac === 0n
    ? whole.toString()
    : `${whole}.${frac.toString().padStart(7, '0').replace(/0+$/, '')}`;
}

export function truncateAddress(address: string, prefixLen = 6, suffixLen = 4): string {
  if (address.length <= prefixLen + suffixLen + 3) {
    return address;
  }
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
