const TOKEN_KEY = 'trustflow_token';
const ADDRESS_KEY = 'trustflow_address';
const EXPIRES_AT_KEY = 'trustflow_expires_at';

/** Default client-side token lifetime, used only when the backend doesn't supply one. */
const DEFAULT_SESSION_TTL_MS = 15 * 60_000;

/**
 * Narrows a stored key to one account, so two signed-in accounts in the same
 * browser never overwrite each other's token. Returns the legacy unscoped key
 * when `scope` is omitted, which is what keeps single-account sessions written
 * by earlier SDK versions readable.
 */
function scopedKey(key: string, scope?: string): string {
  return scope ? `${key}:${scope}` : key;
}

export interface SessionStorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Browser adapter — unchanged behavior from before this session redesign. */
class LocalStorageAdapter implements SessionStorageAdapter {
  get(key: string): string | null {
    return localStorage.getItem(key);
  }
  set(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
  remove(key: string): void {
    localStorage.removeItem(key);
  }
}

/**
 * Process-lifetime fallback for Node/CLI/backend usage.
 *
 * This does NOT survive process restarts. Integrators that need durability
 * (long-running servers, CLIs invoked repeatedly) should call
 * `configureSessionStorage()` with their own adapter (file-backed, Redis,
 * keytar, etc.) — that dependency choice belongs to the integrator, not the SDK.
 */
class InMemoryStorageAdapter implements SessionStorageAdapter {
  private readonly store = new Map<string, string>();
  get(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.store.set(key, value);
  }
  remove(key: string): void {
    this.store.delete(key);
  }
}

// Falls back to the in-memory adapter for the lifetime of the process the first
// time it's needed; resolved lazily (not at module load) so environment detection
// reflects the actual environment at call time, not at import time.
let inMemoryFallback: SessionStorageAdapter | undefined;
let override: SessionStorageAdapter | undefined;

function getStorage(): SessionStorageAdapter {
  if (override) {
    return override;
  }
  if (typeof localStorage !== 'undefined') {
    return new LocalStorageAdapter();
  }
  return (inMemoryFallback ??= new InMemoryStorageAdapter());
}

/**
 * Overrides the storage backend used for session persistence.
 * Intended for Node/CLI/backend integrators who need durability across
 * process restarts, and for tests.
 */
export function configureSessionStorage(adapter: SessionStorageAdapter): void {
  override = adapter;
}

/** Resets the storage backend to the environment default (browser localStorage or in-memory). */
export function resetSessionStorage(): void {
  override = undefined;
  inMemoryFallback = undefined;
}

export interface Session {
  token: string;
  address: string;
  /**
   * UNIX ms timestamp after which the token should be treated as stale.
   *
   * Best-effort only: the backend's `/auth/verify` response does not
   * currently return a token TTL, so unless a caller passes `expiresAt`
   * explicitly to `saveSession`, this is a conservative client-side guess
   * (`DEFAULT_SESSION_TTL_MS`), not a guarantee of the token's real
   * server-side lifetime. Do not rely on it for security-sensitive
   * decisions — always be prepared to handle a `401` from the backend even
   * when `isSessionExpired()` reports `false`. Tracked in
   * https://github.com/trustflow-protocol/trustflow-sdk/issues/82.
   */
  expiresAt: number;
}

/**
 * Persists a session token.
 *
 * Pass `scope` (an account id, in practice `client.accounts.active.id`) to keep
 * concurrent sign-ins isolated: a scoped token lives under
 * `trustflow_token:<scope>` and never collides with another account's, nor with
 * the unscoped key a single-account app writes.
 *
 * @param expiresAt - UNIX ms timestamp when the token expires. Defaults to
 *   `DEFAULT_SESSION_TTL_MS` from now when omitted, since the backend does
 *   not currently return a token TTL — see the `expiresAt` caveat on
 *   {@link Session} and docs/spikes/issue-79-retry-session-multisig.md.
 * @param scope - Optional account scope; omit for the legacy single-session key.
 */
export function saveSession(
  token: string,
  address: string,
  expiresAt?: number,
  scope?: string,
): void {
  const storage = getStorage();
  storage.set(scopedKey(TOKEN_KEY, scope), token);
  storage.set(scopedKey(ADDRESS_KEY, scope), address);
  storage.set(
    scopedKey(EXPIRES_AT_KEY, scope),
    String(expiresAt ?? Date.now() + DEFAULT_SESSION_TTL_MS),
  );
}

/** Reads the session for `scope`, or the unscoped single-account session. */
export function loadSession(scope?: string): Session | null {
  const storage = getStorage();
  const token = storage.get(scopedKey(TOKEN_KEY, scope));
  const address = storage.get(scopedKey(ADDRESS_KEY, scope));
  if (!token || !address) {
    return null;
  }
  const expiresAtRaw = storage.get(scopedKey(EXPIRES_AT_KEY, scope));
  // Backward compatibility: a session written before expiry tracking existed
  // (or by an older version of this SDK) has no `EXPIRES_AT_KEY` entry at
  // all — `storage.get` returns `null`, not a malformed string. Treat that
  // as unknown-but-fine and default to a fresh TTL from now, so upgrading
  // doesn't retroactively expire sessions that predate this field.
  // A *malformed* value (non-null, but not parseable — corrupted storage,
  // hand-edited), by contrast, is treated as already expired rather than
  // silently valid forever (see isSessionExpired()).
  const expiresAt =
    expiresAtRaw === null ? Date.now() + DEFAULT_SESSION_TTL_MS : Number(expiresAtRaw);
  return { token, address, expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0 };
}

/** Clears the session for `scope`, or the unscoped single-account session. */
export function clearSession(scope?: string): void {
  const storage = getStorage();
  storage.remove(scopedKey(TOKEN_KEY, scope));
  storage.remove(scopedKey(ADDRESS_KEY, scope));
  storage.remove(scopedKey(EXPIRES_AT_KEY, scope));
}

/**
 * Purges every session artifact the SDK may have persisted.
 *
 * Clears the unscoped token/address/expiry trio through the active storage
 * adapter, then sweeps **every** `trustflow_`-prefixed key out of
 * `localStorage` and `sessionStorage`. The sweep covers account-scoped
 * sessions (`trustflow_token:<scope>` and friends) plus any legacy keys an
 * earlier SDK version wrote (refresh tokens, challenge nonces), so no cached
 * JWT, refresh token, or nonce can outlive the connection it belonged to.
 *
 * This is what `useWallet().disconnect()` calls (#347): after disconnect,
 * reconnecting requires a fresh signing challenge instead of silently
 * reusing a stored token.
 *
 * Note on custom backends: a storage adapter installed through
 * {@link configureSessionStorage} is always cleared of the three base keys,
 * but adapters that expose no key enumeration cannot be swept for
 * scope-suffixed entries — clear those explicitly in your adapter's own
 * teardown if you use scoped sessions with one.
 */
export function clearAllSessions(): void {
  const storage = getStorage();
  storage.remove(TOKEN_KEY);
  storage.remove(ADDRESS_KEY);
  storage.remove(EXPIRES_AT_KEY);

  const browserStores: Array<Storage | undefined> = [
    typeof localStorage !== 'undefined' ? localStorage : undefined,
    typeof sessionStorage !== 'undefined' ? sessionStorage : undefined,
  ];
  for (const store of browserStores) {
    if (store === undefined) continue;
    const staleKeys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null && key.startsWith('trustflow_')) {
        staleKeys.push(key);
      }
    }
    for (const key of staleKeys) {
      store.removeItem(key);
    }
  }
}

/** True when the stored session is missing or past its `expiresAt`. */
export function isSessionExpired(session: Session | null = loadSession()): boolean {
  if (!session) {
    return true;
  }
  return Date.now() >= session.expiresAt;
}
