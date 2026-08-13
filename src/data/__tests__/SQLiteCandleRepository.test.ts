import {
  afterEach,
  describe,
  expect,
  test
} from "vitest";

import { SQLiteCandleRepository } from "../SQLiteCandleRepository.js";

import type {
  Candle
} from "../../types/market.js";

describe("SQLiteCandleRepository", () => {
  let repository: SQLiteCandleRepository;

  afterEach(() => {
    repository.close();
  });

  test("reports candle coverage", async () => {
    repository =
      new SQLiteCandleRepository(":memory:");

    const candles: Candle[] = [
      {
        symbol: "QQQ",
        timeframe: "5m",
        timestamp: new Date(
          "2026-08-07T14:00:00Z"
        ),
        open: 500,
        high: 502,
        low: 499,
        close: 501,
        volume: 100_000
      },
      {
        symbol: "QQQ",
        timeframe: "5m",
        timestamp: new Date(
          "2026-08-07T14:05:00Z"
        ),
        open: 501,
        high: 503,
        low: 500,
        close: 502,
        volume: 120_000
      }
    ];

    await repository.save(candles);

    const coverage =
      await repository.getCoverage(
        "QQQ",
        "5m"
      );

    expect(coverage).toEqual({
      earliest: new Date(
        "2026-08-07T14:00:00Z"
      ),
      latest: new Date(
        "2026-08-07T14:05:00Z"
      ),
      count: 2
    });
  });

  test("returns empty coverage when no candles exist", async () => {
    repository =
      new SQLiteCandleRepository(":memory:");

    const coverage =
      await repository.getCoverage(
        "QQQ",
        "5m"
      );

    expect(coverage).toEqual({
      earliest: null,
      latest: null,
      count: 0
    });
  });

  test("returns stored candle timestamps in ascending order", async () => {
  repository =
    new SQLiteCandleRepository(":memory:");

  await repository.save([
    {
      symbol: "QQQ",
      timeframe: "5m",
      timestamp: new Date("2026-08-07T14:10:00Z"),
      open: 502,
      high: 504,
      low: 501,
      close: 503,
      volume: 120_000
    },
    {
      symbol: "QQQ",
      timeframe: "5m",
      timestamp: new Date("2026-08-07T14:00:00Z"),
      open: 500,
      high: 502,
      low: 499,
      close: 501,
      volume: 100_000
    },
    {
      symbol: "QQQ",
      timeframe: "5m",
      timestamp: new Date("2026-08-07T14:05:00Z"),
      open: 501,
      high: 503,
      low: 500,
      close: 502,
      volume: 110_000
    }
  ]);

  const timestamps =
    await repository.getTimestamps({
      symbol: "QQQ",
      timeframe: "5m",
      start: new Date("2026-08-07T14:00:00Z"),
      end: new Date("2026-08-07T14:10:00Z")
    });

  expect(timestamps).toEqual([
    new Date("2026-08-07T14:00:00Z"),
    new Date("2026-08-07T14:05:00Z"),
    new Date("2026-08-07T14:10:00Z")
  ]);
});

test("only returns timestamps within the requested range", async () => {
  repository =
    new SQLiteCandleRepository(":memory:");

  await repository.save([
    {
      symbol: "QQQ",
      timeframe: "5m",
      timestamp: new Date("2026-08-07T13:55:00Z"),
      open: 499,
      high: 500,
      low: 498,
      close: 499,
      volume: 90_000
    },
    {
      symbol: "QQQ",
      timeframe: "5m",
      timestamp: new Date("2026-08-07T14:00:00Z"),
      open: 500,
      high: 502,
      low: 499,
      close: 501,
      volume: 100_000
    },
    {
      symbol: "QQQ",
      timeframe: "5m",
      timestamp: new Date("2026-08-07T14:05:00Z"),
      open: 501,
      high: 503,
      low: 500,
      close: 502,
      volume: 110_000
    },
    {
      symbol: "QQQ",
      timeframe: "5m",
      timestamp: new Date("2026-08-07T14:10:00Z"),
      open: 502,
      high: 504,
      low: 501,
      close: 503,
      volume: 120_000
    }
  ]);

  const timestamps =
    await repository.getTimestamps({
      symbol: "QQQ",
      timeframe: "5m",
      start: new Date("2026-08-07T14:00:00Z"),
      end: new Date("2026-08-07T14:05:00Z")
    });

  expect(timestamps).toEqual([
    new Date("2026-08-07T14:00:00Z"),
    new Date("2026-08-07T14:05:00Z")
  ]);
});
});