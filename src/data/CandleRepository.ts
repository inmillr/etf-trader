import type { Candle, Timeframe } from "../types/market.js";

export interface CandleQuery {
  symbol: string;
  timeframe: Timeframe;
  start: Date;
  end: Date;
}

export interface CandleCoverage {
  earliest: Date | null;
  latest: Date | null;
  count: number;
}

export interface CandleRepository {
  save(candles: Candle[]): Promise<void>;

  getCandles(
    query: CandleQuery
  ): Promise<Candle[]>;

  getCoverage(
    symbol: string,
    timeframe: Timeframe
  ): Promise<CandleCoverage>;

  getTimestamps(
    query: CandleQuery
  ): Promise<Date[]>;
}