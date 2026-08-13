import { describe, expect, test } from "vitest";
import { MultiSymbolBacktestEngine } from "../MultiSymbolBacktestEngine.js";
import { calculatePeriodReturnMetrics } from "../ReturnMetrics.js";
import { MovingAverageCrossoverStrategy } from "../../strategy/MovingAverageCrossoverStrategy.js";
import type { Candle } from "../../types/market.js";
import type { EtfCandidate } from "../../universe/EtfRank.js";

function createDailyCandles(
  symbol: string,
  start: string,
  closes: number[],
  volume = 2_000_000
): Candle[] {
  const startDate = new Date(start);

  return closes.map((close, index) => {
    const timestamp = new Date(startDate);

    timestamp.setUTCDate(
      startDate.getUTCDate() + index
    );

    return {
      symbol,
      timeframe: "1d" as const,
      timestamp,
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume
    };
  });
}

describe("MultiSymbolBacktestEngine", () => {
  test("produces daily and weekly return metrics", () => {
    const candidates: EtfCandidate[] = [
      {
        symbol: "SOXX",
        name: "Semiconductor",
        category: "thematic"
      },
      {
        symbol: "QQQ",
        name: "QQQ",
        category: "broad"
      },
      {
        symbol: "XLU",
        name: "Utilities",
        category: "sector"
      }
    ];

    const uptrend = Array.from(
      { length: 80 },
      (_, index) => 100 + index * 1.5
    );

    const sideways = Array.from(
      { length: 80 },
      (_, index) => 50 + (index % 2)
    );

    const candlesBySymbol = new Map([
      [
        "SPY",
        createDailyCandles(
          "SPY",
          "2026-01-01",
          uptrend
        )
      ],
      [
        "SOXX",
        createDailyCandles(
          "SOXX",
          "2026-01-01",
          uptrend.map((value) => value * 2)
        )
      ],
      [
        "QQQ",
        createDailyCandles(
          "QQQ",
          "2026-01-01",
          uptrend.map((value) => value * 1.5)
        )
      ],
      [
        "XLU",
        createDailyCandles(
          "XLU",
          "2026-01-01",
          sideways
        )
      ]
    ]);

    const engine =
      new MultiSymbolBacktestEngine();

    const result = engine.run(
      candidates,
      candlesBySymbol,
      () =>
        new MovingAverageCrossoverStrategy({
          fastPeriod: 5,
          slowPeriod: 15
        }),
      {
        start: new Date("2026-02-01T00:00:00Z"),
        end: new Date("2026-03-15T00:00:00Z"),
        topCount: 2,
        selectionLookbackDays: 30,
        rebalanceFrequency: "weekly",
        enterOnSelection: false,
        portfolio: {
          initialCash: 10_000,
          commissionPerTrade: 0,
          slippagePercent: 0
        }
      }
    );

    const metrics =
      calculatePeriodReturnMetrics(
        result.equityCurve
      );

    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.rebalanceCount).toBeGreaterThan(0);
    expect(result.selections.length).toBeGreaterThan(0);
    expect(metrics.totalDays).toBeGreaterThan(0);
    expect(metrics.totalWeeks).toBeGreaterThan(0);
    expect(
      Number.isFinite(
        metrics.averageDailyReturn
      )
    ).toBe(true);
    expect(
      Number.isFinite(
        metrics.averageWeeklyReturn
      )
    ).toBe(true);
  });
});
