import type { Candle, Timeframe } from "../types/market.js";
import type { MarketDataProvider } from "./MarketData.js";
import type { CandleRepository } from "./CandleRepository.js";
import { validateHistoricalDataRequest } from "./MarketDataValidation.js";

export interface HistoricalDataRequest {
  symbol: string;
  timeframe: Timeframe;
  start: Date;
  end: Date;
}

export class MarketDataService {
  constructor(
    private readonly provider: MarketDataProvider,
    private readonly repository: CandleRepository
  ) {}

  async fetchAndStore(
    request: HistoricalDataRequest
  ): Promise<Candle[]> {
    validateHistoricalDataRequest(request);

    const candles =
      await this.provider.getHistoricalCandles(request);

    await this.repository.save(candles);

    return candles;
  }

  async getStoredCandles(
    request: HistoricalDataRequest
  ): Promise<Candle[]> {
    return this.repository.getCandles(request);
  }
}