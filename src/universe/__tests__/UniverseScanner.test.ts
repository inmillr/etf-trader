import { describe, expect, test } from "vitest";
import type { Candle } from "../../types/market.js";
import {
  calculateCompositeScore,
  calculateDrawdown,
  calculateRelativeMomentum,
  calculateReturnPercent,
  calculateScoringFactors,
  calculateTrendStrength,
  calculateVolatilityFit,
  normalizeRelativeMomentum
} from "../ScoringFactors.js";
import {
  applyUniverseFilter,
  DEFAULT_UNIVERSE_FILTER
} from "../UniverseFilter.js";

function createDailyCandles(
  symbol: string,
  closes: number[],
  volume = 2_000_000
): Candle[] {
  const start = new Date("2026-01-02T00:00:00Z");

  return closes.map((close, index) => {
    const timestamp = new Date(start);

    timestamp.setUTCDate(
      start.getUTCDate() + index
    );

    return {
      symbol,
      timeframe: "1d" as const,
      timestamp,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume
    };
  });
}

describe("UniverseFilter", () => {
  test("passes liquid ETFs with sufficient history", () => {
    const candles = createDailyCandles(
      "QQQ",
      Array.from({ length: 40 }, (_, index) => 400 + index)
    );

    const result = applyUniverseFilter(
      candles,
      DEFAULT_UNIVERSE_FILTER
    );

    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.metrics.latestPrice).toBe(439);
  });

  test("rejects ETFs with insufficient history", () => {
    const candles = createDailyCandles(
      "QQQ",
      Array.from({ length: 10 }, (_, index) => 400 + index)
    );

    const result = applyUniverseFilter(
      candles,
      DEFAULT_UNIVERSE_FILTER
    );

    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain("Insufficient history");
  });

  test("rejects low-volume ETFs", () => {
    const candles = createDailyCandles(
      "QQQ",
      Array.from({ length: 40 }, (_, index) => 400 + index),
      10_000
    );

    const result = applyUniverseFilter(
      candles,
      DEFAULT_UNIVERSE_FILTER
    );

    expect(result.passed).toBe(false);
    expect(result.reasons.some(
      (reason) => reason.includes("volume")
    )).toBe(true);
  });
});

describe("ScoringFactors", () => {
  test("calculates positive return over lookback", () => {
    const candles = createDailyCandles(
      "QQQ",
      Array.from({ length: 30 }, (_, index) => 100 + index)
    );

    const result = calculateReturnPercent(candles, 5);

    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
  });

  test("ranks stronger momentum above benchmark", () => {
    const strong = createDailyCandles(
      "SOXX",
      Array.from({ length: 30 }, (_, index) => 200 + index * 2)
    );

    const weak = createDailyCandles(
      "XLU",
      Array.from({ length: 30 }, (_, index) => 70 - index * 0.1)
    );

    const benchmark = createDailyCandles(
      "SPY",
      Array.from({ length: 30 }, (_, index) => 500 + index * 0.2)
    );

    const strongMomentum =
      calculateRelativeMomentum(
        strong,
        benchmark,
        5
      );

    const weakMomentum =
      calculateRelativeMomentum(
        weak,
        benchmark,
        5
      );

    expect(strongMomentum).toBeGreaterThan(
      weakMomentum
    );
  });

  test("detects bullish trend strength", () => {
    const candles = createDailyCandles(
      "QQQ",
      Array.from({ length: 30 }, (_, index) => 400 + index * 3)
    );

    const trend = calculateTrendStrength(candles);

    expect(trend).toBeGreaterThan(0.7);
  });

  test("calculates drawdown for declining series", () => {
    const candles = createDailyCandles(
      "QQQ",
      [
        100, 110, 120, 115, 105, 95, 90
      ]
    );

    const drawdown = calculateDrawdown(candles);

    expect(drawdown).toBeCloseTo(25, 0);
  });

  test("scores stronger ETF higher than weaker ETF", () => {
    const benchmark = createDailyCandles(
      "SPY",
      Array.from({ length: 40 }, (_, index) => 500 + index * 0.5)
    );

    const leader = createDailyCandles(
      "SOXX",
      Array.from({ length: 40 }, (_, index) => 200 + index * 2)
    );

    const laggard = createDailyCandles(
      "XLU",
      Array.from({ length: 40 }, (_, index) => 70 - index * 0.05)
    );

    const leaderFactors = calculateScoringFactors(
      leader,
      benchmark
    );

    const laggardFactors = calculateScoringFactors(
      laggard,
      benchmark
    );

    const leaderScore = calculateCompositeScore(
      leaderFactors
    );

    const laggardScore = calculateCompositeScore(
      laggardFactors
    );

    expect(leaderScore).toBeGreaterThan(
      laggardScore
    );
  });

  test("normalizes relative momentum into zero-to-one range", () => {
    expect(
      normalizeRelativeMomentum(-5)
    ).toBe(0);

    expect(
      normalizeRelativeMomentum(0)
    ).toBe(0.5);

    expect(
      normalizeRelativeMomentum(5)
    ).toBe(1);
  });

  test("scores volatility closest to the ideal ATR band highest", () => {
    const idealBand = createDailyCandles(
      "QQQ",
      Array.from({ length: 30 }, () => 400)
    ).map((candle, index) => ({
      ...candle,
      timestamp: new Date(
        Date.UTC(2026, 0, 2 + index)
      ),
      open: 398,
      high: 405,
      low: 395,
      close: 400
    }));

    const tooQuiet = createDailyCandles(
      "XLU",
      Array.from({ length: 30 }, () => 70)
    ).map((candle, index) => ({
      ...candle,
      timestamp: new Date(
        Date.UTC(2026, 0, 2 + index)
      ),
      open: 70,
      high: 70,
      low: 70,
      close: 70
    }));

    const idealScore = calculateVolatilityFit(
      idealBand
    );

    const quietScore = calculateVolatilityFit(
      tooQuiet
    );

    expect(idealScore).toBeGreaterThan(0.5);
    expect(idealScore).toBeGreaterThan(quietScore);
  });
});
