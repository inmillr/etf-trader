import type { Candle, Timeframe } from "../types/market.js";
import type { CandleRepository } from "../data/CandleRepository.js";

export interface BacktestDataRequest {
  symbol: string;
  timeframe: Timeframe;
  start: Date;
  end: Date;
}

export class BacktestDataLoader {
  constructor(
    private readonly repository: CandleRepository
  ) {}

  async load(
    request: BacktestDataRequest
  ): Promise<Candle[]> {
    if (!request.symbol.trim()) {
      throw new Error(
        "Symbol cannot be empty."
      );
    }

    if (request.start >= request.end) {
      throw new Error(
        "Start date must be before end date."
      );
    }

    return this.repository.getCandles({
      symbol: request.symbol,
      timeframe: request.timeframe,
      start: request.start,
      end: request.end
    });
  }
}