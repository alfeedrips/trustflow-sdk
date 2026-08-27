import { DisputeClient } from '../src/escrow/dispute';

const mockHttpPost = jest.fn();
const mockHttpGet = jest.fn();

jest.mock('../src/utils/http', () => ({
  createApiHttpClient: jest.fn(() => ({
    post: mockHttpPost,
    get: mockHttpGet,
  })),
  toApiErrorMessage: (error: unknown) =>
    error instanceof Error ? `Network error: ${error.message}` : `Network error: ${String(error)}`,
}));

describe('DisputeClient', () => {
  beforeEach(() => {
    mockHttpPost.mockReset();
    mockHttpGet.mockReset();
  });

  it('initialises with api url and token', () => {
    const client = new DisputeClient('http://api', 'tok');
    expect(client).toBeDefined();
  });

  it('returns success for raiseDispute when API responds with ID', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: { id: 'dsp-1' } });

    const client = new DisputeClient('http://api', 'tok');
    const result = await client.raiseDispute({ escrowId: 'esc-1', reason: 'test' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.disputeId).toBe('dsp-1');
    }
  });

  it('returns error result on network failure', async () => {
    mockHttpPost.mockRejectedValueOnce(new Error('connection reset'));

    const client = new DisputeClient('http://api', 'tok');
    const result = await client.raiseDispute({ escrowId: 'esc-1', reason: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Network error/);
    }
  });

  it('returns dispute payload for getDispute', async () => {
    mockHttpGet.mockResolvedValueOnce({ data: { id: 'dsp-1', status: 'open' } });

    const client = new DisputeClient('http://api', 'tok');
    const result = await client.getDispute('esc-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: 'dsp-1', status: 'open' });
    }
  });
});
