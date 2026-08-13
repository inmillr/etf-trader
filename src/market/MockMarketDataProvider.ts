import type { Candle, Timeframe } from "../types/market.js";
import type { MarketDataProvider } from "./MarketDataProvider.js";

export class MockMarketDataProvider implements MarketDataProvider {
  async getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    start: Date,
    end: Date
  ): Promise<Candle[]> {
    return [
      {
        symbol,
        timeframe,
        timestamp: start,
        open: 500,
        high: 501,
        low: 499,
        close: 500.50,
        volume: 125000
      },
      {
        symbol,
        timeframe,
        timestamp: new Date(start.getTime() + 5 * 60 * 1000),
        open: 500.50,
        high: 502,
        low: 500,
        close: 501.75,
        volume: 150000
      }
    ];
  }

  async subscribeToCandles(
    symbols: string[],
    timeframe: Timeframe,
    onCandle: (candle: Candle) => void
  ): Promise<void> {
    for (const symbol of symbols) {
      onCandle({
        symbol,
        timeframe,
        timestamp: new Date(),
        open: 501.75,
        high: 503,
        low: 501.50,
        close: 502.80,
        volume: 175000
      });
    }
  }
}