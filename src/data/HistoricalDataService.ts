import type { Candle, Timeframe } from "../types/market.js";

export interface HistoricalDataRange {
  symbol: string;
  timeframe: Timeframe;
  start: Date;
  end: Date;
}

export interface HistoricalDataServiceOptions {
  chunkDays?: number;
}

export interface HistoricalDataFetcher {
  fetchAndStore(
    request: HistoricalDataRange
  ): Promise<Candle[]>;

  getStoredCandles(
    request: HistoricalDataRange
  ): Promise<Candle[]>;
}

export class HistoricalDataService {
  private readonly chunkDays: number;

  constructor(
    private readonly marketDataService: HistoricalDataFetcher,
    options: HistoricalDataServiceOptions = {}
  ) {
    this.chunkDays = options.chunkDays ?? 7;

    if (this.chunkDays <= 0) {
      throw new Error(
        "chunkDays must be greater than zero."
      );
    }
  }

  async fetchRange(
  range: HistoricalDataRange
): Promise<number> {
  const storedCandles =
    await this.marketDataService.getStoredCandles(
      range
    );

  const storedTimestamps =
    new Set(
      storedCandles.map(
        (candle) => candle.timestamp.getTime()
      )
    );

  const intervalMilliseconds =
    this.getIntervalMilliseconds(
      range.timeframe
    );

  const chunkMilliseconds =
    this.chunkDays *
    24 *
    60 *
    60 *
    1000;

  let totalFetched = 0;

  let currentStart =
    new Date(range.start);

  while (currentStart < range.end) {
    const chunkEnd =
      new Date(
        Math.min(
          currentStart.getTime() +
            chunkMilliseconds,
          range.end.getTime()
        )
      );

    let timestamp =
      currentStart.getTime();

    while (timestamp < chunkEnd.getTime()) {
      if (storedTimestamps.has(timestamp)) {
        timestamp += intervalMilliseconds;
        continue;
      }

      const missingStart =
        new Date(timestamp);

      let missingEndTimestamp =
        timestamp + intervalMilliseconds;

      while (
        missingEndTimestamp < chunkEnd.getTime() &&
        !storedTimestamps.has(
          missingEndTimestamp
        )
      ) {
        missingEndTimestamp +=
          intervalMilliseconds;
      }

      const missingEnd =
        new Date(
          Math.min(
            missingEndTimestamp,
            chunkEnd.getTime()
          )
        );

      const candles =
        await this.marketDataService.fetchAndStore({
          symbol: range.symbol,
          timeframe: range.timeframe,
          start: missingStart,
          end: missingEnd
        });

      totalFetched += candles.length;

      for (const candle of candles) {
        storedTimestamps.add(
          candle.timestamp.getTime()
        );
      }

      timestamp = missingEndTimestamp;
    }

    currentStart = chunkEnd;
  }

  return totalFetched;
}

private getIntervalMilliseconds(
  timeframe: Timeframe
): number {
  switch (timeframe) {
    case "1m":
      return 1 * 60 * 1000;

    case "5m":
      return 5 * 60 * 1000;

    case "15m":
      return 15 * 60 * 1000;

    case "30m":
      return 30 * 60 * 1000;

    case "1h":
      return 60 * 60 * 1000;

    case "1d":
      return 24 * 60 * 60 * 1000;
  }
}
}