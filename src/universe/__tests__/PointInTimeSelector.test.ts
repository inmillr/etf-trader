import { describe, expect, test } from "vitest";
import type { Candle } from "../../types/market.js";
import type { EtfCandidate } from "../EtfRank.js";
import {
  calculateReturnCorrelation,
  isRebalanceDate,
  selectTopEtfsAtDate
} from "../PointInTimeSelector.js";

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

describe("PointInTimeSelector", () => {
  test("selects strongest momentum ETF as of date", () => {
    const candidates: EtfCandidate[] = [
      {
        symbol: "SOXX",
        name: "Semiconductor",
        category: "thematic"
      },
      {
        symbol: "XLU",
        name: "Utilities",
        category: "sector"
      }
    ];

    const candlesBySymbol = new Map([
      [
        "SPY",
        createDailyCandles(
          "SPY",
          Array.from({ length: 40 }, (_, index) => 500 + index * 0.5)
        )
      ],
      [
        "SOXX",
        createDailyCandles(
          "SOXX",
          Array.from({ length: 40 }, (_, index) => 200 + index * 2)
        )
      ],
      [
        "XLU",
        createDailyCandles(
          "XLU",
          Array.from({ length: 40 }, (_, index) => 70 - index * 0.05)
        )
      ]
    ]);

    const selection = selectTopEtfsAtDate(
      new Date("2026-02-15T00:00:00Z"),
      candidates,
      candlesBySymbol,
      {
        topCount: 1,
        lookbackDays: 30
      }
    );

    expect(selection.selectedSymbols).toEqual([
      "SOXX"
    ]);
  });

  test("does not use future candles for selection", () => {
    const candidates: EtfCandidate[] = [
      {
        symbol: "QQQ",
        name: "QQQ",
        category: "broad"
      }
    ];

    const candles = createDailyCandles(
      "QQQ",
      Array.from({ length: 40 }, (_, index) => 400 + index)
    );

    const candlesBySymbol = new Map([
      ["SPY", candles],
      ["QQQ", candles]
    ]);

    const early = selectTopEtfsAtDate(
      new Date("2026-02-10T00:00:00Z"),
      candidates,
      candlesBySymbol,
      {
        topCount: 1,
        lookbackDays: 60,
        filter: {
          minAvgDailyVolume: 500_000,
          minAvgDailyDollarVolume: 10_000_000,
          minPrice: 10,
          minHistoryDays: 15
        }
      }
    );

    const late = selectTopEtfsAtDate(
      new Date("2026-02-20T00:00:00Z"),
      candidates,
      candlesBySymbol,
      {
        topCount: 1,
        lookbackDays: 60,
        filter: {
          minAvgDailyVolume: 500_000,
          minAvgDailyDollarVolume: 10_000_000,
          minPrice: 10,
          minHistoryDays: 15
        }
      }
    );

    expect(early.selectedSymbols).toEqual(["QQQ"]);
    expect(late.selectedSymbols).toEqual(["QQQ"]);
    expect(
      late.scores[0]!.score
    ).toBeGreaterThanOrEqual(
      early.scores[0]!.score
    );
  });

  test("skips correlated ETFs when selecting multiple symbols", () => {
    const sharedTrend = Array.from(
      { length: 40 },
      (_, index) => 100 + index
    );

    const candidates: EtfCandidate[] = [
      {
        symbol: "QQQ",
        name: "QQQ",
        category: "broad"
      },
      {
        symbol: "SPY",
        name: "SPY",
        category: "broad"
      },
      {
        symbol: "XLU",
        name: "Utilities",
        category: "sector"
      }
    ];

    const candlesBySymbol = new Map([
      [
        "SPY",
        createDailyCandles(
          "SPY",
          sharedTrend
        )
      ],
      [
        "QQQ",
        createDailyCandles(
          "QQQ",
          sharedTrend.map(
            (value) => value * 1.01
          )
        )
      ],
      [
        "XLU",
        createDailyCandles(
          "XLU",
          Array.from(
            { length: 40 },
            (_, index) => 70 + index * 0.2
          )
        )
      ]
    ]);

    const correlation =
      calculateReturnCorrelation(
        candlesBySymbol.get("QQQ")!,
        candlesBySymbol.get("SPY")!
      );

    expect(correlation).toBeGreaterThan(0.9);

    const selection = selectTopEtfsAtDate(
      new Date("2026-02-15T00:00:00Z"),
      candidates,
      candlesBySymbol,
      {
        topCount: 2,
        lookbackDays: 30,
        maxCorrelation: 0.85,
        filter: {
          minAvgDailyVolume: 500_000,
          minAvgDailyDollarVolume: 10_000_000,
          minPrice: 10,
          minHistoryDays: 15
        }
      }
    );

    expect(
      selection.selectedSymbols.length
    ).toBeGreaterThanOrEqual(1);

    expect(
      selection.selectedSymbols.includes("QQQ") &&
      selection.selectedSymbols.includes("SPY")
    ).toBe(false);
  });

  test("identifies rebalance dates by frequency", () => {
    expect(
      isRebalanceDate(
        new Date("2026-01-05T00:00:00Z"),
        "weekly"
      )
    ).toBe(true);

    expect(
      isRebalanceDate(
        new Date("2026-01-06T00:00:00Z"),
        "weekly"
      )
    ).toBe(false);

    expect(
      isRebalanceDate(
        new Date("2026-01-06T00:00:00Z"),
        "daily"
      )
    ).toBe(true);
  });
});
