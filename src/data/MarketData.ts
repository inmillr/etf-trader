import type { Candle, Timeframe } from "../types/market.js";

export interface HistoricalDataRequest {
  symbol: string;
  timeframe: Timeframe;
  start: Date;
  end: Date;
}

export interface MarketDataProvider {
  getHistoricalCandles(
    request: HistoricalDataRequest
  ): Promise<Candle[]>;
}