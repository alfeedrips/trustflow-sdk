import { logger } from '../utils/logger';

export type StellarNetwork = 'TESTNET' | 'MAINNET' | 'FUTURENET' | 'LOCALNET';

export interface StellarNetworkConfig {
  horizonUrl: string;
  rpcUrl: string;
  passphrase: string;
}

/** Represents the health status of an RPC endpoint. */
export interface RpcEndpointHealth {
  url: string;
  healthy: boolean;
  lastCheckTime?: number;
  consecutiveFailures: number;
}

/** Options for NetworkManager health checks. */
export interface HealthCheckOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

/** Manages multiple RPC endpoints with automatic failover and health checks. */
export class NetworkManager {
  private endpoints: Map<string, RpcEndpointHealth> = new Map();
  private currentIndex = 0;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private readonly healthCheckIntervalMs: number;
  private readonly healthCheckTimeoutMs: number;

  constructor(rpcUrls: string[], options: HealthCheckOptions = {}) {
    if (!rpcUrls || rpcUrls.length === 0) {
      throw new Error('At least one RPC URL is required');
    }

    this.healthCheckIntervalMs = options.intervalMs ?? 30000;
    this.healthCheckTimeoutMs = options.timeoutMs ?? 5000;

    rpcUrls.forEach((url) => {
      this.endpoints.set(url, {
        url,
        healthy: true,
        consecutiveFailures: 0,
      });
    });
  }

  /**
   * Get the current healthy RPC endpoint URL.
   * Uses round-robin selection among healthy endpoints.
   */
  getCurrentRpcUrl(): string {
    const endpointArray = Array.from(this.endpoints.values());
    const healthyEndpoints = endpointArray.filter((ep) => ep.healthy);

    if (healthyEndpoints.length === 0) {
      logger.warn('No healthy RPC endpoints available, using first endpoint');
      return endpointArray[0].url;
    }

    const endpoint = healthyEndpoints[this.currentIndex % healthyEndpoints.length];
    this.currentIndex += 1;
    return endpoint.url;
  }

  /**
   * Report a failure on an RPC endpoint and trigger failover if needed.
   */
  reportFailure(url: string): void {
    const endpoint = this.endpoints.get(url);
    if (!endpoint) return;

    endpoint.consecutiveFailures += 1;
    const failureThreshold = 3;

    if (endpoint.consecutiveFailures >= failureThreshold) {
      endpoint.healthy = false;
      logger.warn(
        `RPC endpoint ${url} marked unhealthy after ${endpoint.consecutiveFailures} failures`,
      );
    }
  }

  /**
   * Report a success on an RPC endpoint (recovery).
   */
  reportSuccess(url: string): void {
    const endpoint = this.endpoints.get(url);
    if (!endpoint) return;

    if (endpoint.consecutiveFailures > 0) {
      logger.info(`RPC endpoint ${url} recovered after ${endpoint.consecutiveFailures} failures`);
    }
    endpoint.consecutiveFailures = 0;
    endpoint.healthy = true;
    endpoint.lastCheckTime = Date.now();
  }

  /**
   * Start periodic health checks on all RPC endpoints.
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return;

    this.performHealthCheck();
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckIntervalMs);
  }

  /**
   * Perform health check on all RPC endpoints.
   */
  private performHealthCheck(): void {
    const endpoints = Array.from(this.endpoints.values());

    for (const endpoint of endpoints) {
      this.checkEndpointHealth(endpoint);
    }
  }

  /**
   * Check if a single RPC endpoint is healthy by making a simple RPC call.
   */
  private async checkEndpointHealth(endpoint: RpcEndpointHealth): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.healthCheckTimeoutMs);

      const response = await fetch(`${endpoint.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getHealth',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.reportSuccess(endpoint.url);
      } else {
        this.reportFailure(endpoint.url);
      }
    } catch (error) {
      this.reportFailure(endpoint.url);
    }
  }

  /**
   * Stop periodic health checks.
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Get health status of all endpoints.
   */
  getHealthStatus(): RpcEndpointHealth[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * Destroy the network manager and clean up resources.
   */
  destroy(): void {
    this.stopHealthChecks();
    this.endpoints.clear();
  }
}

export const NETWORKS: Record<StellarNetwork, StellarNetworkConfig> = {
  MAINNET: {
    horizonUrl: 'https://horizon.stellar.org',
    rpcUrl: 'https://soroban.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
  TESTNET: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  FUTURENET: {
    horizonUrl: 'https://horizon-futurenet.stellar.org',
    rpcUrl: 'https://rpc-futurenet.stellar.org',
    passphrase: 'Test SDF Future Network ; October 2022',
  },
  LOCALNET: {
    horizonUrl: 'http://localhost:8000',
    rpcUrl: 'http://localhost:8000/rpc',
    passphrase: 'Standalone Network ; February 2017',
  },
};

/** @deprecated Use {@link NETWORKS}; retained as the original canonical name. */
export const NETWORK_CONFIGS = NETWORKS;

export function getNetworkConfig(network: StellarNetwork) {
  return NETWORKS[network];
}
