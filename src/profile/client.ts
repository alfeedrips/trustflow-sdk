import type { SDKResult } from '../types/index';
import type { Profile, UpdateProfileParams } from '../types/profile';
import type { ContractConfig } from '../types/contract';
import { isValidStellarAddress } from '../utils/validation';
import { createApiHttpClient, toApiErrorMessage } from '../utils/http';
import type { ApiRetryConfig } from '../utils/http';
import type { HttpInterceptors } from '../utils/interceptors';
import { TrustFlowError } from '../errors';

function isValidUrlOrIpfs(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('ipfs://')) {
    return url.length > 7;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface ProfileClientOptions {
  /** Per-request timeout (ms) applied to backend profile calls. */
  timeoutMs?: number;
  /**
   * Retry budget for backend calls. Defaults to 3 retries with a 250ms base
   * delay and a 2s cap.
   *
   * Only transient failures are retried, and only for idempotent methods:
   * `getProfile` (`GET`) is retried, `updateProfile` (`PUT`, which is
   * idempotent) is retried, and neither is retried on `4xx`.
   */
  retry?: ApiRetryConfig;
  /** Request/response interceptor hooks applied to profile API calls. */
  interceptors?: HttpInterceptors;
}

/**
 * Type-safe Axios wrapper for the TrustFlow backend's `/profiles` endpoints.
 *
 * **Retry behaviour:** `getProfile` is a `GET` and `updateProfile` a `PUT`, both
 * idempotent, so `429`, `5xx` and transport errors are retried with capped,
 * jittered backoff (honouring `Retry-After`), while `4xx` fails immediately.
 *
 * @example
 * ```typescript
 * const profiles = new ProfileClient({ apiBaseUrl: 'https://api.trustflow.dev', apiKey: token });
 * const result = await profiles.getProfile(wallet.publicKey);
 * if (result.ok) console.log(result.data.displayName);
 * ```
 */
export class ProfileClient {
  private readonly http;
  private readonly apiUrl: string;
  private readonly token: string;

  constructor(config: ContractConfig, options?: ProfileClientOptions);
  /** @deprecated Pass a ContractConfig object instead. */
  constructor(apiUrl: string, token: string, options?: ProfileClientOptions);
  constructor(
    configOrUrl: ContractConfig | string,
    tokenOrOptions: string | ProfileClientOptions = {},
    legacyOptions: ProfileClientOptions = {},
  ) {
    const config = typeof configOrUrl === 'string' ? undefined : configOrUrl;
    this.apiUrl = config ? (config.apiBaseUrl ?? '') : String(configOrUrl ?? '');
    this.token = config
      ? (config.apiKey ?? '')
      : typeof tokenOrOptions === 'string'
        ? tokenOrOptions
        : '';
    const options = typeof tokenOrOptions === 'string' ? legacyOptions : tokenOrOptions;

    if (!this.apiUrl || !this.apiUrl.trim()) {
      throw new TrustFlowError('apiUrl is required and cannot be empty', 'INVALID_CONFIG');
    }
    if (!this.token || !this.token.trim()) {
      throw new TrustFlowError('token is required and cannot be empty', 'INVALID_CONFIG');
    }

    this.http = createApiHttpClient({
      baseURL: this.apiUrl,
      timeoutMs: options.timeoutMs,
      retry: options.retry,
      interceptors: options.interceptors,
      additionalHeaders: {
        Authorization: `Bearer ${this.token}`,
      },
    });
  }

  /**
   * Fetches a user's profile from the backend API.
   *
   * Retries transient backend failures (network error, timeout, `429`, `5xx`)
   * with capped, jittered backoff before returning an error.
   */
  async getProfile(address: string): Promise<SDKResult<Profile>> {
    if (!isValidStellarAddress(address)) {
      return { ok: false, error: `Invalid Stellar address for "address": ${address}` };
    }
    try {
      const response = await this.http.get<Profile>(`/profiles/${address}`);
      return { ok: true, data: response.data };
    } catch (e) {
      return { ok: false, error: toApiErrorMessage(e) };
    }
  }

  /**
   * Updates a user's profile via the backend API.
   *
   * `PUT` is idempotent, so transient backend failures (network error, timeout,
   * `429`, `5xx`) are retried with capped, jittered backoff before returning an
   * error. `4xx` fails immediately.
   */
  async updateProfile(address: string, params: UpdateProfileParams): Promise<SDKResult<Profile>> {
    if (!isValidStellarAddress(address)) {
      return { ok: false, error: `Invalid Stellar address for "address": ${address}` };
    }
    if (params.displayName !== undefined) {
      if (typeof params.displayName !== 'string' || params.displayName.length > 100) {
        return {
          ok: false,
          error: 'displayName must be a string with a maximum of 100 characters',
        };
      }
    }
    if (params.bio !== undefined) {
      if (typeof params.bio !== 'string' || params.bio.length > 500) {
        return { ok: false, error: 'bio must be a string with a maximum of 500 characters' };
      }
    }
    if (params.avatarUrl !== undefined) {
      if (typeof params.avatarUrl !== 'string' || !isValidUrlOrIpfs(params.avatarUrl)) {
        return { ok: false, error: 'avatarUrl must be a valid HTTP, HTTPS, or IPFS URL' };
      }
    }
    try {
      const response = await this.http.put<Profile>(`/profiles/${address}`, params);
      return { ok: true, data: response.data };
    } catch (e) {
      return { ok: false, error: toApiErrorMessage(e) };
    }
  }
}
