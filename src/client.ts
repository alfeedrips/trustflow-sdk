import { Horizon } from '@stellar/stellar-sdk';
import { HORIZON_URLS, SOROBAN_RPC_URLS, DEFAULT_NETWORK, SDK_VERSION } from './constants';
import { TrustFlowError } from './errors';
import type { Network, ClientConfig } from './types';
import { IPFSStorage } from './storage';

/**
 * TrustFlowClient is the main entry point for interacting with the TrustFlow Protocol.
 * It handles network configuration, RPC connections, and provides access to escrow operations.
 */
export class TrustFlowClient {
  private server: Horizon.Server;
  private _connected: boolean = false;

  readonly network: Network;
  readonly contractId: string;
  readonly rpcUrl: string;
  readonly apiBaseUrl?: string;
  readonly apiKey?: string;
  readonly version: string = SDK_VERSION;
  /** IPFS upload helper — `client.storage.upload(file)`. */
  readonly storage: IPFSStorage;

  /**
   * Creates a new TrustFlow client instance.
   *
   * @param config - Client configuration options
   * @param config.contractId - The Soroban contract ID for TrustFlow escrow
   * @param config.network - Network type ('TESTNET' or 'MAINNET'), defaults to TESTNET
   * @param config.rpcUrl - Optional custom Soroban RPC URL
   * @param config.apiBaseUrl - Optional TrustFlow API base URL for backend integration
   * @param config.apiKey - Optional API key for authenticated requests
   * @param config.ipfs - Optional configuration for the built-in `storage.upload()` IPFS helper
   *
   * @example
   * ```typescript
   * const client = new TrustFlowClient({
   *   contractId: process.env.CONTRACT_ID!,
   *   network: 'TESTNET',
   *   apiBaseUrl: 'https://api.trustflow.xyz',
   *   apiKey: process.env.API_KEY
   * });
   * await client.connect();
   *
   * const upload = await client.storage.upload(fileBuffer, { filename: 'contract.pdf' });
   * if (upload.ok) console.log('Uploaded:', upload.data.url);
   * ```
   */
  constructor(config: ClientConfig) {
    if (!config.contractId) {
      throw new TrustFlowError('contractId is required', 'INVALID_CONFIG');
    }

    this.network = config.network ?? DEFAULT_NETWORK;
    this.contractId = config.contractId;
    this.rpcUrl = config.rpcUrl ?? SOROBAN_RPC_URLS[this.network];
    this.apiBaseUrl = config.apiBaseUrl;
    this.apiKey = config.apiKey;
    this.storage = new IPFSStorage(config.ipfs);

    this.server = new Horizon.Server(HORIZON_URLS[this.network]);
  }

  /**
   * Establishes connection to the Stellar network and verifies connectivity.
   * Must be called before performing any network operations.
   *
   * @throws {TrustFlowError} If connection to the network fails
   *
   * @example
   * ```typescript
   * await client.connect();
   * console.log('Connected to', client.network);
   * ```
   */
  async connect(): Promise<void> {
    try {
      // Test connection by fetching ledger info
      await this.server.ledgers().limit(1).call();
      this._connected = true;
    } catch (error) {
      this._connected = false;
      throw new TrustFlowError('Failed to connect to Stellar network', 'CONNECTION_ERROR', error);
    }
  }

  /**
   * Checks if the client is currently connected to the network.
   *
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Retrieves the native XLM balance for a given Stellar address.
   *
   * @param address - Stellar public key (G... address)
   * @returns Balance in XLM as a string
   * @throws {TrustFlowError} If the account doesn't exist or network error occurs
   *
   * @example
   * ```typescript
   * const balance = await client.getBalance('GDEPOSITOR...');
   * console.log(`Balance: ${balance} XLM`);
   * ```
   */
  async getBalance(address: string): Promise<string> {
    try {
      const account = await this.server.loadAccount(address);
      const native = account.balances.find((b: any) => b.asset_type === 'native');
      return native?.balance ?? '0';
    } catch (error) {
      throw new TrustFlowError(
        `Failed to fetch balance for ${address}`,
        'BALANCE_FETCH_ERROR',
        error,
      );
    }
  }

  /**
   * Returns the underlying Horizon server instance for advanced operations.
   *
   * @returns Horizon.Server instance
   * @internal
   */
  getServer(): Horizon.Server {
    return this.server;
  }

  /**
   * Gets the network passphrase for transaction signing.
   *
   * @returns Network passphrase string
   */
  getNetworkPassphrase(): string {
    return this.network === 'TESTNET'
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015';
  }

  /**
   * Creates authorization headers for API requests when apiKey is configured.
   *
   * @returns Headers object with authentication
   * @internal
   */
  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-SDK-Version': this.version,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Verifies that the client is connected before performing operations.
   *
   * @throws {TrustFlowError} If not connected
   * @internal
   */
  ensureConnected(): void {
    if (!this._connected) {
      throw new TrustFlowError('Client is not connected. Call connect() first.', 'NOT_CONNECTED');
    }
  }

  /**
   * Returns a summary of the client configuration.
   *
   * @returns Object containing client configuration details
   */
  getConfig(): {
    network: Network;
    contractId: string;
    rpcUrl: string;
    apiConfigured: boolean;
    version: string;
  } {
    return {
      network: this.network,
      contractId: this.contractId,
      rpcUrl: this.rpcUrl,
      apiConfigured: Boolean(this.apiBaseUrl && this.apiKey),
      version: this.version,
    };
  }
}
