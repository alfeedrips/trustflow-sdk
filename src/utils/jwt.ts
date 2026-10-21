/**
 * Decodes a JWT's payload and extracts the `exp` claim as a UNIX-ms timestamp.
 *
 * This is the single implementation of JWT-expiry decoding for the SDK: both
 * `authenticateWithWallet` (session persistence) and `TokenRefreshManager`
 * (refresh scheduling) use it, so their behaviour cannot drift apart.
 *
 * - Uses only base64 decoding — no signature verification. Signature trust is
 *   the backend's responsibility; this is a best-effort client-side hint.
 * - JWT segments are base64url (RFC 4648 §5): `-`/`_` replace `+`/`/` and
 *   padding is omitted. `atob()` rejects `-`/`_` outright, so the segment is
 *   normalized to standard base64 before either decoder sees it.
 * - Decodes through `Buffer` when available (Node) and falls back to `atob`
 *   (browsers, workers, edge runtimes without a `Buffer` global). Returns
 *   `null` — never throws — when neither decoder exists or the token is
 *   malformed, so callers apply their own default TTL.
 *
 * @param token - Compact-serialization JWT (`header.payload.signature`)
 * @returns UNIX-ms expiry from the `exp` claim, or `null` when it cannot be read
 */
export function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // base64url → base64, then restore the padding JWT segments omit.
    const segment = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = segment.padEnd(segment.length + ((4 - (segment.length % 4)) % 4), '=');

    let json: string;
    if (typeof Buffer !== 'undefined') {
      json = Buffer.from(padded, 'base64').toString('utf-8');
    } else if (typeof atob === 'function') {
      json = atob(padded);
    } else {
      return null;
    }

    const payload = JSON.parse(json);
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000; // seconds → ms
    }
    return null;
  } catch {
    return null;
  }
}
