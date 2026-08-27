import axios, { AxiosError, AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

/**
 * Retry tuning for backend API requests.
 */
export interface ApiRetryConfig {
  /** Total retry attempts after the first request. Defaults to 3. */
  retries?: number;
  /** Base retry delay in milliseconds. Defaults to 250ms. */
  retryDelayMs?: number;
  /** Maximum retry delay in milliseconds. Defaults to 2000ms. */
  maxRetryDelayMs?: number;
}

export interface ApiHttpClientOptions {
  baseURL: string;
  apiKey?: string;
  timeoutMs?: number;
  retry?: ApiRetryConfig;
  additionalHeaders?: Record<string, string>;
}

const DEFAULT_RETRY_CONFIG: Required<ApiRetryConfig> = {
  retries: 3,
  retryDelayMs: 250,
  maxRetryDelayMs: 2000,
};

/**
 * Creates an Axios instance configured with safe automatic retries for transient failures.
 *
 * Retries are applied to network failures, `429`, and `5xx` responses.
 */
export function createApiHttpClient(options: ApiHttpClientOptions): AxiosInstance {
  const retryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...options.retry,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.additionalHeaders,
  };

  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

  const instance = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 10_000,
    headers,
  });

  axiosRetry(instance, {
    retries: retryConfig.retries,
    retryCondition: (error) => {
      const status = error.response?.status;
      if (status === 429) {
        return true;
      }
      if (typeof status === 'number' && status >= 500 && status < 600) {
        return true;
      }
      return axiosRetry.isNetworkOrIdempotentRequestError(error);
    },
    retryDelay: (retryCount) => {
      const delay = retryConfig.retryDelayMs * 2 ** (retryCount - 1);
      return Math.min(delay, retryConfig.maxRetryDelayMs);
    },
  });

  return instance;
}

/**
 * Maps unknown transport errors into stable SDK error strings.
 */
export function toApiErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    if (typeof status === 'number') {
      return statusText ? `HTTP ${status}: ${statusText}` : `HTTP ${status}`;
    }
    return `Network error: ${error.message}`;
  }
  if (error instanceof Error) {
    return `Network error: ${error.message}`;
  }
  return `Network error: ${String(error)}`;
}
