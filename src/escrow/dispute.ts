import { DisputeParams, SDKResult } from '../types/index';
import { createApiHttpClient, toApiErrorMessage } from '../utils/http';

export interface DisputeClientOptions {
  timeoutMs?: number;
}

export class DisputeClient {
  private readonly http;

  constructor(
    private apiUrl: string,
    private token: string,
    options: DisputeClientOptions = {},
  ) {
    this.http = createApiHttpClient({
      baseURL: this.apiUrl,
      timeoutMs: options.timeoutMs,
      additionalHeaders: {
        Authorization: `Bearer ${this.token}`,
      },
    });
  }

  /**
   * Creates a dispute via the backend API.
   *
   * Transient backend failures are automatically retried before returning an error.
   */
  async raiseDispute(params: DisputeParams): Promise<SDKResult<{ disputeId: string }>> {
    try {
      const response = await this.http.post<{ id: string }>('/disputes', params);
      const data = response.data;
      return { ok: true, data: { disputeId: data.id } };
    } catch (e) {
      return { ok: false, error: toApiErrorMessage(e) };
    }
  }

  /**
   * Retrieves dispute details from the backend API.
   *
   * Transient backend failures are automatically retried before returning an error.
   */
  async getDispute(escrowId: string): Promise<SDKResult<unknown>> {
    try {
      const response = await this.http.get<unknown>(`/disputes/${escrowId}`);
      return { ok: true, data: response.data };
    } catch (e) {
      return { ok: false, error: toApiErrorMessage(e) };
    }
  }
}
