import { describe, expect, test } from "vitest";
import {
  DEFAULT_ETF_UNIVERSE,
  StaticUniverseProvider
} from "../EtfUniverse.js";
import { EtfScanner } from "../EtfScanner.js";
import type { Candle } from "../../types/market.js";
import type { CandleSource } from "../EtfScanner.js";
import type { EtfCandidate } from "../EtfRank.js";

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

class MockCandleSource
  implements CandleSource {

  constructor(
    private readonly data: Map<string, Candle[]>
  ) {}

  async getDailyCandles(
    symbol: string
  ): Promise<Candle[]> {
    return this.data.get(symbol) ?? [];
  }
}

describe("EtfScanner", () => {
  test("ranks passing ETFs by score and assigns ranks", async () => {
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

    const source = new MockCandleSource(
      new Map([
        ["SPY", benchmark],
        ["SOXX", leader],
        ["XLU", laggard]
      ])
    );

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

    const scanner = new EtfScanner(source);

    const results = await scanner.scanTop(
      candidates,
      2
    );

    expect(results).toHaveLength(2);
    expect(results[0]!.symbol).toBe("SOXX");
    expect(results[0]!.rank).toBe(1);
    expect(results[1]!.symbol).toBe("XLU");
    expect(results[0]!.score).toBeGreaterThan(
      results[1]!.score
    );
  });

  test("includes filtered-out ETFs after ranked results", async () => {
    const benchmark = createDailyCandles(
      "SPY",
      Array.from({ length: 40 }, (_, index) => 500 + index)
    );

    const passing = createDailyCandles(
      "QQQ",
      Array.from({ length: 40 }, (_, index) => 400 + index)
    );

    const failing = createDailyCandles(
      "ILLQ",
      Array.from({ length: 40 }, (_, index) => 20 + index),
      1_000
    );

    const source = new MockCandleSource(
      new Map([
        ["SPY", benchmark],
        ["QQQ", passing],
        ["ILLQ", failing]
      ])
    );

    const scanner = new EtfScanner(source);

    const results = await scanner.scan([
      {
        symbol: "QQQ",
        name: "QQQ",
        category: "broad"
      },
      {
        symbol: "ILLQ",
        name: "Illiquid",
        category: "thematic"
      }
    ]);

    expect(results[0]!.passedFilter).toBe(true);
    expect(results[0]!.rank).toBe(1);

    const filtered = results.find(
      (result) => result.symbol === "ILLQ"
    );

    expect(filtered?.passedFilter).toBe(false);
    expect(filtered?.rank).toBe(0);
    expect(filtered?.filterReasons.length).toBeGreaterThan(0);
  });
});

describe("StaticUniverseProvider", () => {
  test("returns the default ETF universe", async () => {
    const provider = new StaticUniverseProvider();

    const candidates =
      await provider.getCandidates();

    expect(candidates.length).toBe(
      DEFAULT_ETF_UNIVERSE.length
    );

    expect(
      candidates.some(
        (candidate) =>
          candidate.symbol === "QQQ"
      )
    ).toBe(true);
  });
});
