import {
  describe,
  expect,
  test,
  vi
} from "vitest";

import {
  BacktestDataLoader
} from "../BacktestDataLoader.js";

import type {
  Candle
} from "../../types/market.js";

import type {
  CandleRepository
} from "../../data/CandleRepository.js";

const candle: Candle = {
  symbol: "QQQ",
  timeframe: "5m",
  timestamp:
    new Date("2026-01-01T14:00:00Z"),
  open: 500,
  high: 502,
  low: 499,
  close: 501,
  volume: 100_000
};

function createRepository(): CandleRepository {
  return {
    save: vi.fn()
      .mockResolvedValue(undefined),

    getCandles: vi.fn()
      .mockResolvedValue([candle]),

    getCoverage: vi.fn()
      .mockResolvedValue({
        earliest: candle.timestamp,
        latest: candle.timestamp,
        count: 1
      }),

    getTimestamps: vi.fn()
      .mockResolvedValue([
        candle.timestamp
      ])
  };
}

describe(
  "BacktestDataLoader",
  () => {
    test(
      "loads candles from the repository",
      async () => {
        const repository =
          createRepository();

        const loader =
          new BacktestDataLoader(
            repository
          );

        const request = {
          symbol: "QQQ",
          timeframe: "5m" as const,
          start:
            new Date(
              "2026-01-01T14:00:00Z"
            ),
          end:
            new Date(
              "2026-01-01T15:00:00Z"
            )
        };

        const result =
          await loader.load(request);

        expect(result)
          .toEqual([candle]);

        expect(
          repository.getCandles
        ).toHaveBeenCalledOnce();

        expect(
          repository.getCandles
        ).toHaveBeenCalledWith(
          request
        );
      }
    );

    test(
      "rejects an empty symbol",
      async () => {
        const repository =
          createRepository();

        const loader =
          new BacktestDataLoader(
            repository
          );

        await expect(
          loader.load({
            symbol: "",
            timeframe: "5m",
            start:
              new Date(
                "2026-01-01T14:00:00Z"
              ),
            end:
              new Date(
                "2026-01-01T15:00:00Z"
              )
          })
        ).rejects.toThrow(
          "Symbol cannot be empty."
        );

        expect(
          repository.getCandles
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "rejects an invalid date range",
      async () => {
        const repository =
          createRepository();

        const loader =
          new BacktestDataLoader(
            repository
          );

        await expect(
          loader.load({
            symbol: "QQQ",
            timeframe: "5m",
            start:
              new Date(
                "2026-01-02T14:00:00Z"
              ),
            end:
              new Date(
                "2026-01-01T14:00:00Z"
              )
          })
        ).rejects.toThrow(
          "Start date must be before end date."
        );

        expect(
          repository.getCandles
        ).not.toHaveBeenCalled();
      }
    );
  }
);