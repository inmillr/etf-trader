import type { Candle } from "../types/market.js";

export class CandleSeries {
  private readonly candles: Candle[];

  constructor(candles: Candle[] = []) {
    this.candles = [...candles];
  }

  add(candle: Candle): void {
    this.candles.push(candle);
  }

  getAll(): Candle[] {
    return [...this.candles];
  }

  get length(): number {
    return this.candles.length;
  }

  getLatest(): Candle | undefined {
    return this.candles[this.candles.length - 1];
  }

  getCloses(): number[] {
    return this.candles.map((candle) => candle.close);
  }

  getVolumes(): number[] {
    return this.candles.map((candle) => candle.volume);
  }
}