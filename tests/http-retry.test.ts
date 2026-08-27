import axios, { AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { createApiHttpClient, toApiErrorMessage } from '../src/utils/http';

jest.mock('axios', () => ({
    __esModule: true,
    default: {
        create: jest.fn(),
    },
    AxiosError: class MockAxiosError extends Error {
        response?: { status?: number; statusText?: string };

        constructor(message: string, response?: { status?: number; statusText?: string }) {
            super(message);
            this.response = response;
        }
    },
}));

jest.mock('axios-retry', () => {
    const retryFn = jest.fn();
    (retryFn as any).isNetworkOrIdempotentRequestError = jest.fn();
    return {
        __esModule: true,
        default: retryFn,
    };
});

describe('createApiHttpClient', () => {
    const mockedAxios = axios as unknown as { create: jest.Mock };
    const mockedAxiosRetry = axiosRetry as unknown as jest.Mock & {
        isNetworkOrIdempotentRequestError: jest.Mock;
    };

    beforeEach(() => {
        mockedAxios.create.mockReset();
        mockedAxiosRetry.mockReset();
        mockedAxiosRetry.isNetworkOrIdempotentRequestError.mockReset();
    });

    it('configures axios instance with default headers and timeout', () => {
        const instance = { get: jest.fn() };
        mockedAxios.create.mockReturnValue(instance);

        const result = createApiHttpClient({ baseURL: 'https://api.trustflow.xyz', apiKey: 'token' });

        expect(result).toBe(instance);
        expect(mockedAxios.create).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: 'https://api.trustflow.xyz',
                timeout: 10_000,
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer token',
                }),
            }),
        );
    });

    it('retries on 429 and 5xx responses', () => {
        mockedAxios.create.mockReturnValue({});
        mockedAxiosRetry.isNetworkOrIdempotentRequestError.mockReturnValue(false);

        createApiHttpClient({ baseURL: 'https://api.trustflow.xyz' });

        const retryOptions = mockedAxiosRetry.mock.calls[0][1] as {
            retryCondition: (error: { response?: { status?: number } }) => boolean;
        };

        expect(retryOptions.retryCondition({ response: { status: 429 } })).toBe(true);
        expect(retryOptions.retryCondition({ response: { status: 503 } })).toBe(true);
        expect(retryOptions.retryCondition({ response: { status: 404 } })).toBe(false);
    });

    it('falls back to network/idempotent retry detection for non-http errors', () => {
        mockedAxios.create.mockReturnValue({});
        mockedAxiosRetry.isNetworkOrIdempotentRequestError.mockReturnValue(true);

        createApiHttpClient({ baseURL: 'https://api.trustflow.xyz' });

        const retryOptions = mockedAxiosRetry.mock.calls[0][1] as {
            retryCondition: (error: Record<string, unknown>) => boolean;
        };

        expect(retryOptions.retryCondition({ code: 'ECONNRESET' })).toBe(true);
        expect(mockedAxiosRetry.isNetworkOrIdempotentRequestError).toHaveBeenCalled();
    });

    it('uses exponential retry delay with max cap', () => {
        mockedAxios.create.mockReturnValue({});

        createApiHttpClient({
            baseURL: 'https://api.trustflow.xyz',
            retry: { retryDelayMs: 100, maxRetryDelayMs: 250 },
        });

        const retryOptions = mockedAxiosRetry.mock.calls[0][1] as {
            retryDelay: (retryCount: number) => number;
        };

        expect(retryOptions.retryDelay(1)).toBe(100);
        expect(retryOptions.retryDelay(2)).toBe(200);
        expect(retryOptions.retryDelay(3)).toBe(250);
    });
});

describe('toApiErrorMessage', () => {
    it('formats axios errors with status', () => {
        const error = new (AxiosError as unknown as new (
            message: string,
            response?: { status?: number; statusText?: string },
        ) => Error)('failed', { status: 503, statusText: 'Service Unavailable' });

        expect(toApiErrorMessage(error)).toBe('HTTP 503: Service Unavailable');
    });

    it('formats network errors and unknown values', () => {
        expect(toApiErrorMessage(new Error('timeout'))).toBe('Network error: timeout');
        expect(toApiErrorMessage('boom')).toBe('Network error: boom');
    });
});
