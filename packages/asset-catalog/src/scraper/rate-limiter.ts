export class RateLimiter {
  private lastRequest = 0;
  private queue: Promise<void> = Promise.resolve();
  private delayMs: number;

  constructor(delayMs: number = 10_000) {
    this.delayMs = delayMs;
  }

  async wait(): Promise<void> {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const elapsed = now - this.lastRequest;
      if (elapsed < this.delayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.delayMs - elapsed)
        );
      }
      this.lastRequest = Date.now();
    });
    return this.queue;
  }
}
