import {
  saveSession,
  loadSession,
  clearSession,
  clearAllSessions,
  isSessionExpired,
  configureSessionStorage,
  resetSessionStorage,
  SessionStorageAdapter,
} from '../src/auth/session';

describe('Session management', () => {
  const mockStorage: Record<string, string> = {};
  beforeAll(() => {
    (global as any).localStorage = {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
    };
  });

  it('saves and loads session', () => {
    saveSession('tok123', 'GABC');
    const s = loadSession();
    expect(s?.token).toBe('tok123');
    expect(s?.address).toBe('GABC');
  });

  it('clears session', () => {
    saveSession('tok', 'GABC');
    clearSession();
    expect(loadSession()).toBeNull();
  });

  describe('token expiry', () => {
    afterEach(() => clearSession());

    it('defaults to a non-expired session when no expiresAt is given', () => {
      saveSession('tok123', 'GABC');
      expect(isSessionExpired()).toBe(false);
    });

    it('honors an explicit expiresAt in the past', () => {
      saveSession('tok123', 'GABC', Date.now() - 1000);
      expect(isSessionExpired()).toBe(true);
    });

    it('honors an explicit expiresAt in the future', () => {
      saveSession('tok123', 'GABC', Date.now() + 60_000);
      expect(isSessionExpired()).toBe(false);
    });

    it('treats a missing session as expired', () => {
      expect(isSessionExpired()).toBe(true);
    });

    it('treats a pre-existing session with no stored expiresAt key as not expired (backward compatibility)', () => {
      // Simulates a session written by a pre-expiry version of this SDK:
      // only token/address were ever persisted, no `trustflow_expires_at`
      // key exists at all (distinct from a malformed value — see below).
      // loadSession() computes a fresh default TTL from "now" in this case,
      // so an old session isn't treated as already-expired just because it
      // predates expiry tracking.
      (global as any).localStorage.setItem('trustflow_token', 'legacy-tok');
      (global as any).localStorage.setItem('trustflow_address', 'GLEGACY');

      const s = loadSession();
      expect(s?.token).toBe('legacy-tok');
      expect(isSessionExpired(s)).toBe(false);
    });

    it('treats a malformed stored expiresAt as expired rather than valid forever', () => {
      saveSession('tok123', 'GABC');
      // Corrupt the persisted expiry directly, as if storage was hand-edited
      // or written by an older/incompatible client.
      (global as any).localStorage.setItem('trustflow_expires_at', 'not-a-number');

      expect(isSessionExpired()).toBe(true);
      // The token/address themselves should still load fine.
      expect(loadSession()?.token).toBe('tok123');
    });
  });

  describe('configureSessionStorage', () => {
    afterEach(() => resetSessionStorage());

    it('routes reads/writes through an injected adapter', () => {
      const backing: Record<string, string> = {};
      const adapter: SessionStorageAdapter = {
        get: (k) => backing[k] ?? null,
        set: (k, v) => { backing[k] = v; },
        remove: (k) => { delete backing[k]; },
      };
      configureSessionStorage(adapter);

      saveSession('custom-tok', 'GXYZ');
      expect(loadSession()?.token).toBe('custom-tok');
      expect(backing['trustflow_token']).toBe('custom-tok');

      // The globally-mocked localStorage from the outer describe block must
      // not have been touched while the override is active.
      expect(mockStorage['trustflow_token']).not.toBe('custom-tok');
    });

    it('propagates errors from an adapter that fails, rather than swallowing them', () => {
      const throwingAdapter: SessionStorageAdapter = {
        get: () => {
          throw new Error('storage unavailable');
        },
        set: () => {
          throw new Error('storage unavailable');
        },
        remove: () => {
          throw new Error('storage unavailable');
        },
      };
      configureSessionStorage(throwingAdapter);

      expect(() => saveSession('tok', 'GABC')).toThrow('storage unavailable');
      expect(() => loadSession()).toThrow('storage unavailable');
    });
  });

  describe('clearAllSessions', () => {
    // A Storage-shaped mock: clearAllSessions' sweep walks `length`/`key()`,
    // which the outer describe's minimal localStorage mock does not implement.
    const localData: Record<string, string> = {};
    const sessionData: Record<string, string> = {};
    const toStorage = (data: Record<string, string>) => ({
      get length() {
        return Object.keys(data).length;
      },
      key: (i: number) => Object.keys(data)[i] ?? null,
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
    });

    beforeAll(() => {
      (global as any).localStorage = toStorage(localData);
      (global as any).sessionStorage = toStorage(sessionData);
    });

    beforeEach(() => {
      resetSessionStorage();
      for (const k of Object.keys(localData)) delete localData[k];
      for (const k of Object.keys(sessionData)) delete sessionData[k];
    });

    it('removes the unscoped session trio through the active adapter', () => {
      saveSession('tok', 'GABC', Date.now() + 60_000);

      clearAllSessions();

      expect(loadSession()).toBeNull();
      expect(localData['trustflow_token']).toBeUndefined();
      expect(localData['trustflow_address']).toBeUndefined();
      expect(localData['trustflow_expires_at']).toBeUndefined();
    });

    it('sweeps every trustflow_-prefixed key from localStorage and sessionStorage', () => {
      // Unscoped, two scoped sessions, and a legacy key in localStorage.
      localData['trustflow_token'] = 'tok';
      localData['trustflow_token:alice'] = 'tok-alice';
      localData['trustflow_expires_at:bob'] = '123';
      localData['trustflow_refresh'] = 'refresh';
      // A scoped session that was persisted to sessionStorage instead.
      sessionData['trustflow_token:carol'] = 'tok-carol';

      clearAllSessions();

      expect(Object.keys(localData)).toEqual([]);
      expect(Object.keys(sessionData)).toEqual([]);
      expect(loadSession('alice')).toBeNull();
      expect(loadSession('carol')).toBeNull();
    });

    it('leaves keys outside the trustflow_ namespace untouched', () => {
      localData['trustflow_token'] = 'tok';
      localData['other_app'] = 'keep';
      sessionData['theme'] = 'dark';

      clearAllSessions();

      expect(localData['other_app']).toBe('keep');
      expect(sessionData['theme']).toBe('dark');
      expect(localData['trustflow_token']).toBeUndefined();
    });

    it('clears base keys from a custom adapter while still sweeping browser storage', () => {
      const backing: Record<string, string> = {
        trustflow_token: 'custom-tok',
        'trustflow_token:alice': 'custom-scoped',
      };
      const adapter: SessionStorageAdapter = {
        get: (k) => backing[k] ?? null,
        set: (k, v) => {
          backing[k] = v;
        },
        remove: (k) => {
          delete backing[k];
        },
      };
      configureSessionStorage(adapter);
      localData['trustflow_token'] = 'browser-tok';
      sessionData['trustflow_nonce'] = 'nonce';

      clearAllSessions();

      // Base keys go through the adapter...
      expect(backing['trustflow_token']).toBeUndefined();
      // ...while browser storage is swept regardless of the adapter (scoped
      // adapter entries can't be enumerated — documented limitation).
      expect(localData['trustflow_token']).toBeUndefined();
      expect(sessionData['trustflow_nonce']).toBeUndefined();
      expect(backing['trustflow_token:alice']).toBe('custom-scoped');
      resetSessionStorage();
    });
  });
});
