import {
  describe,
  expect,
  test,
  vi
} from "vitest";

import {
  HistoricalDataService
} from "../HistoricalDataService.js";

import {
  MarketDataService
} from "../MarketDataService.js";

import type {
  MarketDataProvider
} from "../MarketData.js";

import type {
  Candle
} from "../../types/market.js";

import type {
  CandleRepository
} from "../CandleRepository.js";

import {
  SQLiteCandleRepository
} from "../SQLiteCandleRepository.js";

describe("HistoricalDataService integration", () => {
  test(
    "fetches and stores each historical chunk",
    async () => {
      const candles: Candle[] = [
        {
          symbol: "QQQ",
          timeframe: "5m",
          timestamp: new Date(
            "2026-01-01T00:00:00Z"
          ),
          open: 500,
          high: 502,
          low: 499,
          close: 501,
          volume: 100_000
        }
      ];

      const provider: MarketDataProvider = {
        getHistoricalCandles: vi
          .fn()
          .mockResolvedValue(candles)
      };

      const repository: CandleRepository = {
  save: vi.fn().mockResolvedValue(undefined),

  getCandles: vi
    .fn()
    .mockResolvedValue([]),

  getCoverage: vi
    .fn()
    .mockResolvedValue({
      earliest: null,
      latest: null,
      count: 0
    }),

    getTimestamps: vi.fn().mockResolvedValue([])

};

      const marketDataService =
        new MarketDataService(
          provider,
          repository
        );

      const historicalDataService =
        new HistoricalDataService(
          marketDataService,
          {
            chunkDays: 7
          }
        );

      const total =
        await historicalDataService.fetchRange({
          symbol: "QQQ",
          timeframe: "5m",
          start: new Date(
            "2026-01-01T00:00:00Z"
          ),
          end: new Date(
            "2026-01-20T00:00:00Z"
          )
        });

      expect(total).toBe(3);

      expect(
        provider.getHistoricalCandles
      ).toHaveBeenCalledTimes(3);

      expect(
        repository.save
      ).toHaveBeenCalledTimes(3);

      expect(
        provider.getHistoricalCandles
      ).toHaveBeenNthCalledWith(
        1,
        {
          symbol: "QQQ",
          timeframe: "5m",
          start: new Date(
            "2026-01-01T00:00:00Z"
          ),
          end: new Date(
            "2026-01-08T00:00:00Z"
          )
        }
      );

      expect(
        provider.getHistoricalCandles
      ).toHaveBeenNthCalledWith(
        2,
        {
          symbol: "QQQ",
          timeframe: "5m",
          start: new Date(
            "2026-01-08T00:00:00Z"
          ),
          end: new Date(
            "2026-01-15T00:00:00Z"
          )
        }
      );

      expect(
        provider.getHistoricalCandles
      ).toHaveBeenNthCalledWith(
        3,
        {
          symbol: "QQQ",
          timeframe: "5m",
          start: new Date(
            "2026-01-15T00:00:00Z"
          ),
          end: new Date(
            "2026-01-20T00:00:00Z"
          )
        }
      );
    }
  );

  test(
  "fills an internal gap using the SQLite repository",
  async () => {
    const repository =
      new SQLiteCandleRepository(":memory:");

    try {
      const start =
        new Date("2026-01-01T00:00:00Z");

      const gapStart =
        new Date("2026-01-01T12:00:00Z");

      const gapEnd =
        new Date("2026-01-01T13:00:00Z");

      const end =
        new Date("2026-01-01T14:00:00Z");

      const storedCandles: Candle[] = [];

      for (
        let timestamp = start.getTime();
        timestamp < end.getTime();
        timestamp += 5 * 60 * 1000
      ) {
        if (
          timestamp >= gapStart.getTime() &&
          timestamp < gapEnd.getTime()
        ) {
          continue;
        }

        storedCandles.push({
          symbol: "QQQ",
          timeframe: "5m",
          timestamp: new Date(timestamp),
          open: 500,
          high: 502,
          low: 499,
          close: 501,
          volume: 100_000
        });
      }

      await repository.save(storedCandles);

      const provider: MarketDataProvider = {
        getHistoricalCandles: vi
          .fn()
          .mockImplementation(
            async (request) => {
              const candles: Candle[] = [];

              for (
                let timestamp =
                  request.start.getTime();
                timestamp <
                  request.end.getTime();
                timestamp += 5 * 60 * 1000
              ) {
                candles.push({
                  symbol: request.symbol,
                  timeframe: request.timeframe,
                  timestamp:
                    new Date(timestamp),
                  open: 500,
                  high: 502,
                  low: 499,
                  close: 501,
                  volume: 100_000
                });
              }

              return candles;
            }
          )
      };

      const marketDataService =
        new MarketDataService(
          provider,
          repository
        );

      const historicalDataService =
        new HistoricalDataService(
          marketDataService,
          {
            chunkDays: 7
          }
        );

      const total =
        await historicalDataService.fetchRange({
          symbol: "QQQ",
          timeframe: "5m",
          start,
          end
        });

      expect(total).toBe(12);

      expect(
        provider.getHistoricalCandles
      ).toHaveBeenCalledOnce();

      expect(
        provider.getHistoricalCandles
      ).toHaveBeenCalledWith({
        symbol: "QQQ",
        timeframe: "5m",
        start: gapStart,
        end: gapEnd
      });

      const finalCandles =
        await repository.getCandles({
          symbol: "QQQ",
          timeframe: "5m",
          start,
          end
        });

      expect(finalCandles).toHaveLength(168);
    } finally {
      repository.close();
    }
  }
);
});