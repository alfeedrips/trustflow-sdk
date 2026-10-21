import { connectWallet, disconnectWallet } from '../src/wallet/connect';
import { getFreighter, isFreighterInstalled } from '../src/wallet/freighter';
import { getAlbedo } from '../src/wallet/albedo';
import { TrustFlowError } from '../src/errors';

describe('wallet module', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    // Reset global window before each test
    global.window = undefined as any;
  });

  afterAll(() => {
    global.window = originalWindow;
  });

  describe('when window is undefined (Node environment)', () => {
    it('getFreighter returns null', () => {
      expect(getFreighter()).toBeNull();
    });

    it('isFreighterInstalled returns false', async () => {
      await expect(isFreighterInstalled()).resolves.toBe(false);
    });

    it('getAlbedo returns null', () => {
      expect(getAlbedo()).toBeNull();
    });
  });

  describe('when window is defined but wallets are not installed', () => {
    beforeEach(() => {
      global.window = {} as any;
    });

    it('getFreighter returns null', () => {
      expect(getFreighter()).toBeNull();
    });

    it('isFreighterInstalled returns false', async () => {
      await expect(isFreighterInstalled()).resolves.toBe(false);
    });

    it('getAlbedo returns null', () => {
      expect(getAlbedo()).toBeNull();
    });
  });

  describe('when wallets are installed', () => {
    const mockFreighter = {
      getPublicKey: jest.fn().mockResolvedValue('GBM...'),
      getNetwork: jest.fn().mockResolvedValue('TESTNET'),
    };
    const mockAlbedo = {
      publicKey: jest.fn().mockResolvedValue({ pubkey: 'GBA...' }),
    };

    beforeEach(() => {
      global.window = {
        freighter: mockFreighter,
        albedo: mockAlbedo,
      } as any;
    });

    it('getFreighter returns the freighter instance wrapper', () => {
      const freighterWrapper = getFreighter();
      expect(freighterWrapper).toBeDefined();
      expect(freighterWrapper?.isAvailable()).toBe(true);
    });

    it('isFreighterInstalled returns true', async () => {
      await expect(isFreighterInstalled()).resolves.toBe(true);
    });

    it('getAlbedo returns the albedo instance', () => {
      expect(getAlbedo()).toBe(mockAlbedo);
    });
  });

  describe('connectWallet', () => {
    beforeEach(() => {
      global.window = undefined as any;
    });

    it('throws UNAUTHORIZED if freighter is not installed', async () => {
      await expect(connectWallet('freighter')).rejects.toMatchObject(
        new TrustFlowError('Freighter not installed', 'UNAUTHORIZED')
      );
    });

    it('throws UNAUTHORIZED if wallet type is unsupported', async () => {
      // @ts-expect-error Testing invalid wallet type
      await expect(connectWallet('unsupported')).rejects.toMatchObject(
        new TrustFlowError('Wallet type unsupported not supported', 'UNAUTHORIZED')
      );
    });

    it('connects to freighter successfully when installed', async () => {
      const mockFreighter = {
        getPublicKey: jest.fn().mockResolvedValue('GBM...'),
        getNetwork: jest.fn().mockResolvedValue('TESTNET'),
      };
      global.window = { freighter: mockFreighter } as any;

      const connection = await connectWallet('freighter');
      expect(connection).toEqual({
        type: 'freighter',
        publicKey: 'GBM...',
        network: 'TESTNET',
      });
    });

    /** A window exposing an Albedo wallet whose `publicKey()` reports `network`. */
    function windowWithAlbedo(network?: string) {
      return {
        albedo: {
          publicKey: jest.fn().mockResolvedValue({ pubkey: 'GBA...', token: '', network }),
        },
      } as any;
    }

    it('reports the network an albedo wallet is on instead of a hardcoded TESTNET', async () => {
      global.window = windowWithAlbedo('public');

      await expect(connectWallet('albedo')).resolves.toEqual({
        type: 'albedo',
        publicKey: 'GBA...',
        network: 'MAINNET',
      });
    });

    it('normalizes the albedo pubnet name to MAINNET', async () => {
      global.window = windowWithAlbedo('pubnet');

      await expect(connectWallet('albedo')).resolves.toMatchObject({ network: 'MAINNET' });
    });

    it('reports TESTNET for an albedo wallet on testnet', async () => {
      global.window = windowWithAlbedo('testnet');

      await expect(connectWallet('albedo')).resolves.toMatchObject({ network: 'TESTNET' });
    });

    it('falls back to TESTNET when albedo does not report a network', async () => {
      global.window = windowWithAlbedo(undefined);

      await expect(connectWallet('albedo')).resolves.toMatchObject({ network: 'TESTNET' });
    });
  });

  describe('disconnectWallet', () => {
    it('is a no-op that resolves successfully', async () => {
      await expect(disconnectWallet()).resolves.toBeUndefined();
    });
  });
});
