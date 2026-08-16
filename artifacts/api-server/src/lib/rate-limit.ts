/**
 * A sliding-window counter for failed attempts.
 *
 * In memory, so it holds for one process and resets on restart. That is the
 * right trade for a single-instance classroom deployment and the wrong one
 * behind a load balancer — the limit there is per instance, not per cluster,
 * and a shared store would be needed. Stated rather than hidden, because a
 * limiter that quietly counts a fraction of the attempts is worse than none.
 *
 * Sliding rather than fixed-window: a fixed window lets an attacker spend the
 * full allowance at the end of one window and again at the start of the next,
 * which is twice the intended rate at the moment it matters most.
 */
export class AttemptLimiter {
  /** Timestamps of recent failures, newest last. */
  readonly #hits = new Map<string, number[]>();

  /**
   * Bound on distinct keys held at once. Emails and IPs both come from the
   * request, so an attacker choosing a fresh value each time would otherwise
   * grow this map without limit — the limiter becoming the denial of service it
   * exists to prevent.
   */
  readonly #maxKeys = 10_000;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  #prune(key: string, now: number): number[] {
    const cutoff = now - this.windowMs;
    const hits = (this.#hits.get(key) ?? []).filter((at) => at > cutoff);
    if (hits.length === 0) this.#hits.delete(key);
    else this.#hits.set(key, hits);
    return hits;
  }

  /** Drops keys whose newest hit has aged out. Called only when the map is full. */
  #sweep(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, hits] of this.#hits) {
      if (hits.length === 0 || hits[hits.length - 1]! <= cutoff) {
        this.#hits.delete(key);
      }
    }
  }

  /** Seconds the caller must wait, or 0 when they are under the limit. */
  retryAfter(key: string): number {
    const now = Date.now();
    const hits = this.#prune(key, now);
    if (hits.length < this.limit) return 0;
    // The window frees up when the oldest hit in it ages out.
    return Math.max(1, Math.ceil((hits[0]! + this.windowMs - now) / 1000));
  }

  /** Counts one failure. Successes must not be recorded. */
  record(key: string): void {
    const now = Date.now();
    const hits = this.#prune(key, now);

    if (!this.#hits.has(key) && this.#hits.size >= this.#maxKeys) {
      this.#sweep(now);
      // Still full after sweeping: every key is live, so refuse to grow. The
      // existing keys keep their limits; a new one goes uncounted this window
      // rather than evicting somebody else's record of failures.
      if (this.#hits.size >= this.#maxKeys) return;
    }

    hits.push(now);
    this.#hits.set(key, hits);
  }

  /** Forgets a key. Called on a successful sign-in so one typo costs nothing. */
  clear(key: string): void {
    this.#hits.delete(key);
  }
}
