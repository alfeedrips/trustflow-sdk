import { retry } from '../src/utils/retry';

describe('retry utility', () => {
  it('resolves on first attempt', async () => {
    const result = await retry(() => Promise.resolve(42), 3, 10);
    expect(result).toBe(42);
  });

  it('retries on failure and eventually resolves', async () => {
    let attempts = 0;
    const result = await retry(() => { attempts++; if (attempts < 3) throw new Error('fail'); return Promise.resolve('ok'); }, 5, 10);
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws after all retries exhausted', async () => {
    await expect(retry(() => Promise.reject(new Error('always fail')), 3, 10)).rejects.toThrow('always fail');
  });
});
