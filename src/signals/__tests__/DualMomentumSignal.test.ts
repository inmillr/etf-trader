import { describe, expect, test } from "vitest";
import type { Candle } from "../../types/market.js";
import type { EtfCandidate } from "../../universe/EtfRank.js";
import {
  evaluateDualMomentumSignal,
  findLatestTradingDay
} from "../DualMomentumSignal.js";

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

describe("DualMomentumSignal", () => {
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

  test("findLatestTradingDay returns most recent benchmark date", () => {
    const candlesBySymbol = new Map([
      [
        "SPY",
        createDailyCandles(
          "SPY",
          "2026-01-01",
          [100, 101, 102]
        )
      ]
    ]);

    expect(
      findLatestTradingDay(candlesBySymbol)
    ).toBe("2026-01-03");
  });

  test("recommends buy on rebalance when flat", () => {
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

    const signal = evaluateDualMomentumSignal(
      "2026-06-01",
      candidates,
      candlesBySymbol,
      {
        lookbackDays: 126,
        selector: {
          filter: {
            minAvgDailyVolume: 100_000,
            minAvgDailyDollarVolume: 1_000_000,
            minPrice: 10,
            minHistoryDays: 30
          }
        }
      }
    );

    expect(signal.isRebalanceDay).toBe(true);
    expect(signal.action).toBe("buy");
    expect(signal.targetSymbol).toBe("QQQ");
  });

  test("recommends hold mid-week when already positioned", () => {
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

    const signal = evaluateDualMomentumSignal(
      "2026-06-03",
      candidates,
      candlesBySymbol,
      {
        lookbackDays: 126,
        heldSymbol: "IWM",
        heldSinceDay: "2026-05-26",
        selector: {
          filter: {
            minAvgDailyVolume: 100_000,
            minAvgDailyDollarVolume: 1_000_000,
            minPrice: 10,
            minHistoryDays: 30
          }
        }
      }
    );

    expect(signal.isRebalanceDay).toBe(false);
    expect(signal.action).toBe("hold");
    expect(signal.targetSymbol).toBe("IWM");
  });
});
