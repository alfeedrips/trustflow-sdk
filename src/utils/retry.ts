export async function retry<T>(
  fn: () => Promise<T>,
  attempts: number,
  delayMs: number,
): Promise<T> {
  let lastErr: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr ?? new Error('Retry failed');
}
