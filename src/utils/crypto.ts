import { TrustFlowError } from '../errors';

/**
 * Generates cryptographically secure random bytes with automatic WebCrypto detection
 * and Node.js crypto fallback.
 *
 * @param length - Number of random bytes to generate
 * @returns Uint8Array of secure random bytes
 */
export function randomBytes(length: number): Uint8Array {
  if (length <= 0) return new Uint8Array(0);

  // 1. Check for standard WebCrypto API (Browsers, Cloudflare Workers, Node.js 19+)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const buffer = new Uint8Array(length);
    globalThis.crypto.getRandomValues(buffer);
    return buffer;
  }

  // 2. Fallback to Node.js crypto module if available
  try {
    const modName = 'crypto';
    // Dynamic lookup avoids bundlers attempting to package Node's crypto into browser builds
    const req = typeof require !== 'undefined' ? require : undefined;
    const nodeCrypto = req ? req(modName) : undefined;
    if (typeof nodeCrypto?.randomBytes === 'function') {
      return new Uint8Array(nodeCrypto.randomBytes(length));
    }
  } catch {
    // Ignore require error if not in Node
  }

  throw new TrustFlowError(
    'No cryptographically secure random number generator is available in this environment',
    'AUTH_ERROR',
  );
}

/**
 * Generates a random hexadecimal string.
 *
 * @param byteLength - Number of random bytes (resulting hex string will be 2x this length)
 */
export function randomHex(byteLength: number): string {
  const bytes = randomBytes(byteLength);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * The 62-character alphanumeric alphabet {@link randomNonce} draws from.
 */
const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Maps random bytes onto an alphabet without modulo bias.
 *
 * A plain `bytes[i] % chars.length` is biased whenever the alphabet doesn't
 * divide 256 evenly: with a 62-character alphabet, byte values 0-247 map
 * exactly four times onto each position, while values 248-255 wrap back onto
 * the first eight positions, making them 25% more likely than they should be.
 * This rejects byte values at or above the largest multiple of
 * `chars.length` that fits in 0-255 (248 for 62 characters), so every
 * remaining byte value class maps to exactly `limit / chars.length` byte
 * values and each alphabet position is equally likely (#352).
 *
 * @param bytes - Raw random bytes (as produced by {@link randomBytes}).
 * @param chars - Non-empty alphabet of at most 256 distinct characters.
 * @returns The accepted characters in byte order; shorter than `bytes` when
 *   samples were rejected.
 * @throws {TrustFlowError} If `chars` is empty or longer than 256.
 */
export function bytesToAlphabet(bytes: Uint8Array, chars: string): string {
  if (chars.length === 0 || chars.length > 256) {
    throw new TrustFlowError(
      'Alphabet for random byte mapping must contain between 1 and 256 characters',
      'AUTH_ERROR',
    );
  }
  const limit = 256 - (256 % chars.length);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte < limit) {
      out += chars[byte % chars.length];
    }
  }
  return out;
}

/**
 * Generates a random alphanumeric nonce string.
 *
 * Byte-to-character mapping uses rejection sampling (via
 * {@link bytesToAlphabet}) rather than raw modulo, so the nonce carries the
 * full entropy of its source bytes with no positional bias (#352).
 *
 * @param length - Length of the nonce (default: 32)
 * @throws {TrustFlowError} If a bias-free nonce can't be assembled within a
 *   bounded number of draw attempts (indicating a broken random source
 *   rather than ordinary statistical noise).
 */
export function randomNonce(length = 32): string {
  if (length <= 0) return '';
  let result = '';
  const MAX_ATTEMPTS = 1000;
  let attempts = 0;
  while (result.length < length) {
    if (++attempts > MAX_ATTEMPTS) {
      throw new TrustFlowError(
        `Failed to generate a bias-free ${length}-character nonce: random source kept producing rejected samples`,
        'AUTH_ERROR',
      );
    }
    result += bytesToAlphabet(randomBytes(length - result.length), NONCE_ALPHABET);
  }
  return result;
}

/**
 * Generates an RFC 4122 v4 compliant UUID using secure random bytes.
 */
export function randomUUID(): string {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const bytes = randomBytes(16);
  // Set version to 0100 (v4)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant to 10xx (RFC 4122)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
