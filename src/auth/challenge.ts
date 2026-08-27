import { createApiHttpClient } from '../utils/http';

export interface AuthChallenge {
  challenge: string;
  expiresAt: number;
  address: string;
}

export interface AuthRequestOptions {
  timeoutMs?: number;
}

/**
 * Requests a signing challenge from the TrustFlow backend.
 *
 * Transient backend failures are automatically retried with exponential backoff.
 */
export async function requestChallenge(
  apiUrl: string,
  address: string,
  options: AuthRequestOptions = {},
): Promise<AuthChallenge> {
  const http = createApiHttpClient({ baseURL: apiUrl, timeoutMs: options.timeoutMs });
  try {
    const response = await http.get<{ challenge: string }>('/auth/challenge', {
      params: { address },
    });
    return { challenge: response.data.challenge, expiresAt: Date.now() + 60_000, address };
  } catch {
    throw new Error('Failed to get challenge');
  }
}

/**
 * Verifies a signature and exchanges it for a backend session token.
 *
 * Transient backend failures are automatically retried with exponential backoff.
 */
export async function verifyAndGetToken(
  apiUrl: string,
  address: string,
  signature: string,
  options: AuthRequestOptions = {},
): Promise<string> {
  const http = createApiHttpClient({ baseURL: apiUrl, timeoutMs: options.timeoutMs });
  try {
    const response = await http.post<{ token: string }>('/auth/verify', { address, signature });
    return response.data.token;
  } catch {
    throw new Error('Signature verification failed');
  }
}
