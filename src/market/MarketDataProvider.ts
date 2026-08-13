import type { Candle, Timeframe } from "../types/market.js";

export interface MarketDataProvider {
  getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    start: Date,
    end: Date
  ): Promise<Candle[]>;

  subscribeToCandles(
    symbols: string[],
    timeframe: Timeframe,
    onCandle: (candle: Candle) => void
  ): Promise<void>;
}