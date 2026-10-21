import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { createApiHttpClient, toApiErrorMessage } from '../src/utils/http';
import { TrustFlowError } from '../src/errors';

/** An adapter that records the call and resolves with an empty 200, so no network is used. */
function recordingAdapter() {
  return jest.fn(async (config: InternalAxiosRequestConfig) => ({
    data: {},
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })) as jest.Mock & AxiosAdapter;
}

describe('request body size validation on createApiHttpClient (#436)', () => {
  const baseURL = 'https://api.trustflow.test';

  it('rejects an oversized JSON body locally with VALIDATION_ERROR and never calls the adapter', async () => {
    const http = createApiHttpClient({
      baseURL,
      requestValidation: { maxRequestSizeBytes: 1024 },
    });
    const adapter = recordingAdapter();
    http.defaults.adapter = adapter;

    await expect(http.post('/things', { payload: 'x'.repeat(2048) })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('sends a JSON body that is within the configured limit', async () => {
    const http = createApiHttpClient({
      baseURL,
      requestValidation: { maxRequestSizeBytes: 1024 },
    });
    const adapter = recordingAdapter();
    http.defaults.adapter = adapter;

    await expect(http.post('/things', { payload: 'small' })).resolves.toMatchObject({
      status: 200,
    });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('does not measure binary bodies such as IPFS uploads as JSON', async () => {
    const http = createApiHttpClient({
      baseURL,
      requestValidation: { maxRequestSizeBytes: 1024 },
    });
    const adapter = recordingAdapter();
    http.defaults.adapter = adapter;

    await expect(http.post('', Buffer.alloc(4096))).resolves.toMatchObject({
      status: 200,
    });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('applies a 10MB default limit when no requestValidation is configured', async () => {
    const http = createApiHttpClient({ baseURL });
    const adapter = recordingAdapter();
    http.defaults.adapter = adapter;

    await expect(
      http.post('/things', { payload: 'x'.repeat(11 * 1024 * 1024) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('reports a local validation failure by its message, not as a network error', () => {
    const error = new TrustFlowError('Request body size (2.00MB) exceeds maximum', 'VALIDATION_ERROR');

    expect(toApiErrorMessage(error)).toBe('Request body size (2.00MB) exceeds maximum');
  });
});
