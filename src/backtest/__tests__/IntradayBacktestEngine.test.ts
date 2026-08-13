import { describe, expect, test } from "vitest";
import { checkStopTargetExit } from "../IntradayExits.js";
import type { Candle } from "../../types/market.js";
import { buildStrategySnapshot } from "../../strategy/StrategySnapshotBuilder.js";
import { IntradayMomentumStrategy } from "../../strategy/IntradayMomentumStrategy.js";
import { IntradayBacktestEngine } from "../IntradayBacktestEngine.js";

function createIntradayCandle(
  symbol: string,
  day: string,
  index: number,
  close: number,
  volume = 100_000
): Candle {
  const timestamp = new Date(
    `${day}T14:${String(index).padStart(2, "0")}:00.000Z`
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

describe("IntradayExits", () => {
  test("triggers stop when low breaches stop price", () => {
    const candle: Candle = {
      symbol: "QQQ",
      timeframe: "5m",
      timestamp: new Date("2026-01-02T15:00:00Z"),
      open: 101,
      high: 101.5,
      low: 98,
      close: 99,
      volume: 100_000
    };

    const exit = checkStopTargetExit(
      candle,
      10,
      {
        stopPrice: 99.5,
        targetPrice: 110
      }
    );

    expect(exit?.reason).toBe("stop");
    expect(exit?.price).toBe(99.5);
  });
});

describe("StrategySnapshotBuilder", () => {
  test("builds snapshot from session candles", () => {
    const history: Candle[] = [];

    for (let i = 0; i < 25; i++) {
      history.push(
        createIntradayCandle(
          "QQQ",
          "2026-01-02",
          i,
          400 + i * 0.5,
          200_000
        )
      );
    }

    const candle = createIntradayCandle(
      "QQQ",
      "2026-01-02",
      25,
      420,
      250_000
    );

    const snapshot = buildStrategySnapshot(
      history,
      candle
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot!.price).toBe(420);
    expect(snapshot!.atr).toBeGreaterThan(0);
  });
});

describe("IntradayBacktestEngine", () => {
  test("runs intraday backtest with exits", () => {
    const candles: Candle[] = [];

    for (let day = 1; day <= 3; day++) {
      for (let i = 0; i < 30; i++) {
        candles.push(
          createIntradayCandle(
            "QQQ",
            `2026-01-0${day}`,
            i,
            400 + day * 2 + i * 0.1,
            300_000
          )
        );
      }
    }

    const engine =
      new IntradayBacktestEngine();

    const result = engine.run(
      candles,
      () => new IntradayMomentumStrategy({
        signalParameters: {
          minimumRelativeVolume: 0.5,
          minimumBullishRSI: 40,
          maximumBearishRSI: 30
        }
      }),
      {
        closeAtEndOfDay: true,
        portfolio: {
          initialCash: 10_000,
          commissionPerTrade: 0,
          slippagePercent: 0
        }
      }
    );

    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.trades).toBeGreaterThan(0);
    expect(result.endOfDayExits).toBeGreaterThan(0);
  });
});
