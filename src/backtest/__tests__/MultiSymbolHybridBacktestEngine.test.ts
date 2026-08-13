import { describe, expect, test } from "vitest";
import {
  evaluateDailyTrend,
  type DailyTrendOptions
} from "../DailyTrendGate.js";
import { MultiSymbolHybridBacktestEngine } from "../MultiSymbolHybridBacktestEngine.js";
import type { Candle } from "../../types/market.js";
import type { EtfCandidate } from "../../universe/EtfRank.js";
import { IntradayMomentumStrategy } from "../../strategy/IntradayMomentumStrategy.js";

function createDailyCandle(
  symbol: string,
  day: string,
  close: number
): Candle {
  return {
    symbol,
    timeframe: "1d",
    timestamp: new Date(`${day}T00:00:00.000Z`),
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 1_000_000
  };
}

function createIntradayCandle(
  symbol: string,
  day: string,
  index: number,
  close: number,
  volume = 200_000
): Candle {
  const timestamp = new Date(
    `${day}T14:${String(30 + index).padStart(2, "0")}:00.000Z`
  );

  return {
    symbol,
    timeframe: "5m",
    timestamp,
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume
  };
}

function buildUptrendDaily(
  symbol: string,
  startDate: string,
  count: number,
  basePrice: number
): Candle[] {
  const candles: Candle[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);

  for (let i = 0; i < count; i++) {
    const day = cursor.toISOString().slice(0, 10);

    candles.push(
      createDailyCandle(
        symbol,
        day,
        basePrice + i * 2
      )
    );

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return candles;
}

describe("DailyTrendGate", () => {
  const options: DailyTrendOptions = {
    fastPeriod: 3,
    slowPeriod: 5
  };

  test("detects bullish trend in rising market", () => {
    const history = buildUptrendDaily(
      "QQQ",
      "2026-01-01",
      8,
      100
    );

    const trend = evaluateDailyTrend(
      history,
      options
    );

    expect(trend).not.toBeNull();
    expect(trend!.bullishEntry).toBe(true);
    expect(trend!.bearishCrossover).toBe(false);
  });

  test("returns null when history is insufficient", () => {
    const history = buildUptrendDaily(
      "QQQ",
      "2026-01-01",
      3,
      100
    );

    expect(
      evaluateDailyTrend(history, options)
    ).toBeNull();
  });
});

describe("MultiSymbolHybridBacktestEngine", () => {
  test("holds overnight and exits on bearish daily crossover", () => {
    const symbol = "QQQ";
    const candidate: EtfCandidate = {
      symbol,
      name: "QQQ",
      category: "broad"
    };

    const daily = buildUptrendDaily(
      symbol,
      "2026-01-01",
      55,
      400
    );

    for (let i = 45; i < daily.length; i++) {
      const day = daily[i]!.timestamp
        .toISOString()
        .slice(0, 10);

      daily[i] = createDailyCandle(
        symbol,
        day,
        400 - (i - 45) * 5
      );
    }

    const intraday: Candle[] = [];
    const intradayStart = new Date("2026-01-10T00:00:00.000Z");
    const intradayEnd = new Date("2026-02-19T00:00:00.000Z");
    const cursor = new Date(intradayStart);

    while (cursor <= intradayEnd) {
      const day = cursor.toISOString().slice(0, 10);

      for (let i = 0; i < 6; i++) {
        intraday.push(
          createIntradayCandle(
            symbol,
            day,
            i,
            420 + cursor.getUTCDate() * 0.1,
            300_000
          )
        );
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const dailyMap = new Map([
      [symbol, daily]
    ]);

    const intradayMap = new Map([
      [symbol, intraday]
    ]);

    const engine =
      new MultiSymbolHybridBacktestEngine();

    const result = engine.run(
      [candidate],
      dailyMap,
      intradayMap,
      () =>
        new IntradayMomentumStrategy({
          signalParameters: {
            minimumRelativeVolume: 0.5,
            minimumBullishRSI: 40,
            maximumBearishRSI: 30
          },
          atrMultiplier: 2,
          rewardRiskRatio: 2,
          entryWindowStartMinutes: 14 * 60,
          entryWindowEndMinutes: 16 * 60
        }),
      {
        start: new Date("2026-01-10"),
        end: new Date("2026-02-19"),
        topCount: 1,
        selectionLookbackDays: 5,
        rebalanceFrequency: "daily",
        trendGate: {
          fastPeriod: 3,
          slowPeriod: 5
        },
        portfolio: {
          initialCash: 10_000,
          commissionPerTrade: 0,
          slippagePercent: 0
        },
        selector: {
          benchmarkSymbol: symbol,
          lookbackDays: 5,
          topCount: 1
        }
      }
    );

    expect(result.trades).toBeGreaterThan(0);
    expect(result.exposurePercent).toBeGreaterThan(0);
    expect(result.equityCurve.length).toBeGreaterThan(0);
  });

  test("blocks intraday entry when daily trend is not bullish", () => {
    const symbol = "QQQ";
    const candidate: EtfCandidate = {
      symbol,
      name: "QQQ",
      category: "broad"
    };

    const daily: Candle[] = [];

    for (let i = 1; i <= 20; i++) {
      const day = String(i).padStart(2, "0");

      daily.push(
        createDailyCandle(
          symbol,
          `2026-01-${day}`,
          500 - i * 3
        )
      );
    }

    const intraday: Candle[] = [];

    for (let i = 0; i < 12; i++) {
      intraday.push(
        createIntradayCandle(
          symbol,
          "2026-01-15",
          i,
          440,
          300_000
        )
      );
    }

    const engine =
      new MultiSymbolHybridBacktestEngine();

    const result = engine.run(
      [candidate],
      new Map([[symbol, daily]]),
      new Map([[symbol, intraday]]),
      () =>
        new IntradayMomentumStrategy({
          signalParameters: {
            minimumRelativeVolume: 0.5,
            minimumBullishRSI: 40,
            maximumBearishRSI: 30
          },
          entryWindowStartMinutes: 14 * 60,
          entryWindowEndMinutes: 16 * 60
        }),
      {
        start: new Date("2026-01-15"),
        end: new Date("2026-01-15"),
        topCount: 1,
        selectionLookbackDays: 5,
        rebalanceFrequency: "daily",
        trendGate: {
          fastPeriod: 3,
          slowPeriod: 5
        },
        portfolio: {
          initialCash: 10_000,
          commissionPerTrade: 0,
          slippagePercent: 0
        },
        selector: {
          benchmarkSymbol: symbol,
          lookbackDays: 5,
          topCount: 1
        }
      }
    );

    expect(result.trades).toBe(0);
    expect(result.finalEquity).toBe(10_000);
  });
});
