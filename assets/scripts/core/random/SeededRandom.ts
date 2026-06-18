export class SeededRandom {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public next(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  public range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  public int(minInclusive: number, maxInclusive: number): number {
    return Math.floor(this.range(minInclusive, maxInclusive + 1));
  }

  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  public pickWeighted<T extends { probability: number }>(items: T[]): T {
    const total = items.reduce((sum, item) => sum + item.probability, 0);
    let cursor = this.range(0, total);

    for (const item of items) {
      cursor -= item.probability;
      if (cursor <= 0) {
        return item;
      }
    }

    return items[items.length - 1];
  }
}
