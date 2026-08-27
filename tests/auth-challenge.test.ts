import { requestChallenge, verifyAndGetToken } from '../src/auth/challenge';

const mockHttpGet = jest.fn();
const mockHttpPost = jest.fn();

jest.mock('../src/utils/http', () => ({
    createApiHttpClient: jest.fn(() => ({
        get: mockHttpGet,
        post: mockHttpPost,
    })),
}));

describe('auth challenge API', () => {
    beforeEach(() => {
        mockHttpGet.mockReset();
        mockHttpPost.mockReset();
    });

    it('returns a challenge payload', async () => {
        mockHttpGet.mockResolvedValueOnce({ data: { challenge: 'nonce-123' } });

        const result = await requestChallenge('https://api.trustflow.xyz', 'G' + 'A'.repeat(55));

        expect(result.challenge).toBe('nonce-123');
        expect(result.address).toBe('G' + 'A'.repeat(55));
        expect(result.expiresAt).toBeGreaterThan(Date.now() - 1_000);
    });

    it('throws on challenge endpoint failure', async () => {
        mockHttpGet.mockRejectedValueOnce(new Error('timeout'));

        await expect(
            requestChallenge('https://api.trustflow.xyz', 'G' + 'A'.repeat(55)),
        ).rejects.toThrow('Failed to get challenge');
    });

    it('returns token after signature verification', async () => {
        mockHttpPost.mockResolvedValueOnce({ data: { token: 'jwt-abc' } });

        const token = await verifyAndGetToken(
            'https://api.trustflow.xyz',
            'G' + 'A'.repeat(55),
            'signed-payload',
        );

        expect(token).toBe('jwt-abc');
    });

    it('throws on signature verification failure', async () => {
        mockHttpPost.mockRejectedValueOnce(new Error('bad signature'));

        await expect(
            verifyAndGetToken('https://api.trustflow.xyz', 'G' + 'A'.repeat(55), 'sig'),
        ).rejects.toThrow('Signature verification failed');
    });
});
