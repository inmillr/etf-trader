import type { Candle } from "../types/market.js";
import type {
  HistoricalDataRequest,
  MarketDataProvider
} from "./MarketData.js";

export class MockMarketDataProvider
  implements MarketDataProvider {

  async getHistoricalCandles(
    request: HistoricalDataRequest
  ): Promise<Candle[]> {
    return [
      {
        symbol: request.symbol,
        timeframe: request.timeframe,
        timestamp: request.start,

        open: 500,
        high: 502,
        low: 499,
        close: 501,

        volume: 100_000
      }
    ];
  }
}