import { TrustFlowClient } from '../src/client';
import { TrustFlowError } from '../src/errors';

describe('TrustFlowClient', () => {
  const mockContractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

  describe('constructor', () => {
    it('should create client with minimal config', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
      });

      expect(client.network).toBe('TESTNET');
      expect(client.contractId).toBe(mockContractId);
      expect(client.version).toBeDefined();
    });

    it('should create client with full config', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
        network: 'MAINNET',
        rpcUrl: 'https://custom-rpc.example.com',
        apiBaseUrl: 'https://api.trustflow.xyz',
        apiKey: 'test-key',
      });

      expect(client.network).toBe('MAINNET');
      expect(client.rpcUrl).toBe('https://custom-rpc.example.com');
      expect(client.apiBaseUrl).toBe('https://api.trustflow.xyz');
      expect(client.apiKey).toBe('test-key');
    });

    it('should throw error if contractId is missing', () => {
      expect(() => {
        new TrustFlowClient({} as any);
      }).toThrow(TrustFlowError);
    });
  });

  describe('getConfig', () => {
    it('should return configuration summary', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
        network: 'TESTNET',
        apiBaseUrl: 'https://api.example.com',
        apiKey: 'test-key',
      });

      const config = client.getConfig();

      expect(config.network).toBe('TESTNET');
      expect(config.contractId).toBe(mockContractId);
      expect(config.apiConfigured).toBe(true);
      expect(config.version).toBeDefined();
    });

    it('should show apiConfigured as false when not configured', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
      });

      const config = client.getConfig();
      expect(config.apiConfigured).toBe(false);
    });
  });

  describe('getNetworkPassphrase', () => {
    it('should return testnet passphrase', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
        network: 'TESTNET',
      });

      expect(client.getNetworkPassphrase()).toContain('Test SDF Network');
    });

    it('should return mainnet passphrase', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
        network: 'MAINNET',
      });

      expect(client.getNetworkPassphrase()).toContain('Public Global Stellar Network');
    });
  });

  describe('getAuthHeaders', () => {
    it('should return headers with SDK version', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
      });

      const headers = client.getAuthHeaders();

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-SDK-Version']).toBeDefined();
    });

    it('should include authorization header when apiKey is provided', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
        apiKey: 'test-key-123',
      });

      const headers = client.getAuthHeaders();

      expect(headers['Authorization']).toBe('Bearer test-key-123');
    });

    it('should not include authorization header when apiKey is missing', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
      });

      const headers = client.getAuthHeaders();

      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('isConnected', () => {
    it('should return false before connection', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
      });

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('ensureConnected', () => {
    it('should throw error if not connected', () => {
      const client = new TrustFlowClient({
        contractId: mockContractId,
      });

      expect(() => client.ensureConnected()).toThrow(TrustFlowError);
      expect(() => client.ensureConnected()).toThrow('not connected');
    });
  });
});
