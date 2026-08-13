import { describe, expect, test } from "vitest";
import type { Candle } from "../../types/market.js";
import type { EtfCandidate } from "../EtfRank.js";
import {
  selectDualMomentumAtDate
} from "../DualMomentumSelector.js";

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
      high: close + 1,
      low: close - 1,
      close,
      volume
    };
  });
}

describe("DualMomentumSelector", () => {
  const candidates: EtfCandidate[] = [
    {
      symbol: "QQQ",
      name: "QQQ",
      category: "broad"
    },
    {
      symbol: "IWM",
      name: "IWM",
      category: "broad"
    }
  ];

  test("selects the strongest relative momentum symbol", () => {
    const candlesBySymbol = new Map([
      [
        "QQQ",
        createDailyCandles(
          "QQQ",
          "2026-01-01",
          Array.from(
            { length: 160 },
            (_, index) => 100 + index * 0.5
          )
        )
      ],
      [
        "IWM",
        createDailyCandles(
          "IWM",
          "2026-01-01",
          Array.from(
            { length: 160 },
            (_, index) => 100 + index * 0.1
          )
        )
      ],
      [
        "SPY",
        createDailyCandles(
          "SPY",
          "2026-01-01",
          Array.from(
            { length: 160 },
            (_, index) => 100 + index * 0.2
          )
        )
      ]
    ]);

    const selection = selectDualMomentumAtDate(
      new Date("2026-06-01"),
      candidates,
      candlesBySymbol,
      {
        lookbackDays: 126,
        filter: {
          minAvgDailyVolume: 100_000,
          minAvgDailyDollarVolume: 1_000_000,
          minPrice: 10,
          minHistoryDays: 30
        }
      }
    );

    expect(selection.selectedSymbols).toEqual([
      "QQQ"
    ]);
    expect(
      selection.scores[0]?.symbol
    ).toBe("QQQ");
  });

  test("returns cash when absolute momentum is negative", () => {
    const candlesBySymbol = new Map([
      [
        "QQQ",
        createDailyCandles(
          "QQQ",
          "2026-01-01",
          Array.from(
            { length: 160 },
            (_, index) =>
              200 - index * 0.6
          )
        )
      ],
      [
        "IWM",
        createDailyCandles(
          "IWM",
          "2026-01-01",
          Array.from(
            { length: 160 },
            (_, index) =>
              180 - index * 0.5
          )
        )
      ],
      [
        "SPY",
        createDailyCandles(
          "SPY",
          "2026-01-01",
          Array.from(
            { length: 160 },
            (_, index) =>
              190 - index * 0.4
          )
        )
      ]
    ]);

    const selection = selectDualMomentumAtDate(
      new Date("2026-06-01"),
      candidates,
      candlesBySymbol,
      {
        lookbackDays: 126,
        filter: {
          minAvgDailyVolume: 100_000,
          minAvgDailyDollarVolume: 1_000_000,
          minPrice: 10,
          minHistoryDays: 30
        }
      }
    );

    expect(selection.selectedSymbols).toEqual([]);
  });
});
