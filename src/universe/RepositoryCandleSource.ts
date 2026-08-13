import type { CandleRepository } from "../data/CandleRepository.js";
import type { Timeframe } from "../types/market.js";
import type { CandleSource } from "./EtfScanner.js";

export class RepositoryCandleSource
  implements CandleSource {

  constructor(
    private readonly repository: CandleRepository,
    private readonly timeframe: Timeframe = "1d"
  ) {}

  async getDailyCandles(
    symbol: string,
    lookbackDays: number
  ): Promise<import("../types/market.js").Candle[]> {
    const end = new Date();
    const start = new Date(end);

    start.setUTCDate(
      start.getUTCDate() - lookbackDays
    );

    return this.repository.getCandles({
      symbol,
      timeframe: this.timeframe,
      start,
      end
    });
  }
}
