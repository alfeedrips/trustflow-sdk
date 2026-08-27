import { IPFSStorage } from '../src/storage/ipfs';
import { createApiHttpClient } from '../src/utils/http';

const mockHttpPost = jest.fn();

jest.mock('../src/utils/http', () => ({
  createApiHttpClient: jest.fn(() => ({ post: mockHttpPost })),
  toApiErrorMessage: (error: unknown) => {
    if (error instanceof Error) {
      return `Network error: ${error.message}`;
    }
    return `Network error: ${String(error)}`;
  },
}));

describe('IPFSStorage.upload', () => {
  beforeEach(() => {
    mockHttpPost.mockReset();
    jest.mocked(createApiHttpClient).mockClear();
  });

  it('rejects an empty file', async () => {
    const storage = new IPFSStorage();
    const result = await storage.upload(Buffer.alloc(0));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/non-empty/);
    }
    expect(mockHttpPost).not.toHaveBeenCalled();
  });

  it('uploads a file and returns the cid and gateway url', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: { cid: 'bafy123' } });

    const storage = new IPFSStorage();
    const result = await storage.upload(Buffer.from('hello world'), { filename: 'hello.txt' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.cid).toBe('bafy123');
      expect(result.data.url).toBe('https://w3s.link/ipfs/bafy123');
    }
  });

  it('uses a custom apiUrl, apiKey, and gatewayUrl when configured', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: { cid: 'bafy456' } });

    const storage = new IPFSStorage({
      apiUrl: 'https://custom-ipfs.example.com/upload',
      apiKey: 'test-key',
      gatewayUrl: 'https://custom-gateway.example.com/ipfs',
    });
    const result = await storage.upload(Buffer.from('data'));

    expect(jest.mocked(createApiHttpClient)).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://custom-ipfs.example.com/upload',
        apiKey: 'test-key',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.url).toBe('https://custom-gateway.example.com/ipfs/bafy456');
    }
  });

  it('forwards content type and filename headers', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: { cid: 'bafy789' } });

    const storage = new IPFSStorage();
    await storage.upload(Buffer.from('data'), {
      filename: 'doc.pdf',
      contentType: 'application/pdf',
    });

    expect(jest.mocked(createApiHttpClient)).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalHeaders: expect.objectContaining({
          'Content-Type': 'application/pdf',
          'X-Name': 'doc.pdf',
        }),
      }),
    );
  });

  it('returns an error when the response has no cid', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: {} });

    const storage = new IPFSStorage();
    const result = await storage.upload(Buffer.from('data'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/CID/);
    }
  });

  it('returns a mapped error when the upload request fails', async () => {
    mockHttpPost.mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'));

    const storage = new IPFSStorage();
    const result = await storage.upload(Buffer.from('data'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Network error/);
    }
  });
});
