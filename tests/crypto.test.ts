import {
  bytesToAlphabet,
  randomBytes,
  randomHex,
  randomNonce,
  randomUUID,
} from '../src/utils/crypto';

describe('Secure Random Generation (#298)', () => {
  it('generates random bytes of requested length', () => {
    const bytes16 = randomBytes(16);
    const bytes32 = randomBytes(32);

    expect(bytes16.length).toBe(16);
    expect(bytes32.length).toBe(32);
    expect(bytes16).toBeInstanceOf(Uint8Array);

    // Verify non-zero randomness
    const sum = bytes16.reduce((acc, val) => acc + val, 0);
    expect(sum).toBeGreaterThan(0);
  });

  it('generates random hex strings', () => {
    const hex = randomHex(16);
    expect(hex.length).toBe(32);
    expect(hex).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates random nonce strings of specified length', () => {
    const nonce = randomNonce(24);
    expect(nonce.length).toBe(24);
    expect(nonce).toMatch(/^[A-Za-z0-9]{24}$/);
  });

  it('generates valid RFC 4122 v4 UUIDs', () => {
    const uuid = randomUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const uuid2 = randomUUID();
    expect(uuid).not.toBe(uuid2);
  });
});

describe('Nonce rejection sampling (#352)', () => {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  it('rejects byte values above the unbiased limit instead of folding them onto early positions', () => {
    const everyByte = Uint8Array.from({ length: 256 }, (_, i) => i);
    const out = bytesToAlphabet(everyByte, ALPHABET);

    // 0-247 accepted (248 = 62 * 4), 248-255 rejected rather than wrapped.
    expect(out.length).toBe(248);

    // Deterministic bias proof: each of the 62 positions appears exactly
    // 4 times, i.e. P(char) = 4/248 = 1/62 — exactly uniform, so each
    // accepted byte carries log2(62) bits of entropy. Raw modulo over all
    // 256 bytes would give the first eight positions 5 occurrences each.
    const counts = new Map<string, number>();
    for (const ch of out) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(62);
    for (const ch of ALPHABET) {
      expect(counts.get(ch)).toBe(4);
    }
  });

  it('accepts every byte when the alphabet divides 256 evenly', () => {
    const alphabet64 = `${ALPHABET}~!`; // 64 distinct characters, 256 % 64 === 0
    const everyByte = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(bytesToAlphabet(everyByte, alphabet64).length).toBe(256);
  });

  it('throws on an empty or oversized alphabet instead of mapping silently', () => {
    expect(() => bytesToAlphabet(new Uint8Array([0]), '')).toThrow('between 1 and 256');
    expect(() => bytesToAlphabet(new Uint8Array([0]), 'x'.repeat(257))).toThrow(
      'between 1 and 256',
    );
  });

  it('keeps the nonce format and honors edge-case lengths', () => {
    expect(randomNonce(0)).toBe('');
    expect(randomNonce(1)).toMatch(/^[A-Za-z0-9]$/);
    expect(randomNonce(64)).toMatch(/^[A-Za-z0-9]{64}$/);
    expect(randomNonce()).toHaveLength(32);
  });

  it('produces distinct nonces across calls', () => {
    const seen = new Set(Array.from({ length: 100 }, () => randomNonce(32)));
    expect(seen.size).toBe(100);
  });

  it('fails closed when the random source only yields rejected samples', () => {
    const g = globalThis as unknown as { crypto: { getRandomValues: (buf: Uint8Array) => Uint8Array } };
    const original = g.crypto.getRandomValues;
    // Shadow with a source that only emits 255 (>= 248 → always rejected),
    // so randomNonce must give up with an error rather than loop forever.
    g.crypto.getRandomValues = (buf) => {
      buf.fill(255);
      return buf;
    };
    try {
      expect(() => randomNonce(8)).toThrow('bias-free');
    } finally {
      g.crypto.getRandomValues = original;
    }
  });
});
