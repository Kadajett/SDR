/**
 * Deterministic PRNG based on Mulberry32, seeded from a string hash.
 * Produces identical sequences for the same seed string.
 */

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash >>> 0;
}

export class SeededRandom {
  private state: number;

  constructor(seed: string) {
    this.state = hashString(seed);
    if (this.state === 0) this.state = 1;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [0, max) */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Pick one element uniformly from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)];
  }

  /** Pick one element using weighted probabilities */
  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Pick n unique elements from an array (without replacement) */
  pickN<T>(arr: readonly T[], n: number): T[] {
    const pool = [...arr];
    const result: T[] = [];
    const count = Math.min(n, pool.length);
    for (let i = 0; i < count; i++) {
      const idx = this.nextInt(pool.length);
      result.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return result;
  }
}

/** Build a seed string from a date and optional variant */
export function buildSeed(date: string, variant: number = 0): string {
  return `${date}-${variant}`;
}
