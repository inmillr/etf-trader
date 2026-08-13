import {
  describe,
  expect,
  test
} from "vitest";

import {
  BacktestEngine
} from "../BacktestEngine.js";

import {
  PortfolioSimulator
} from "../PortfolioSimulator.js";

import type {
  Candle
} from "../../types/market.js";

import type {
  Strategy
} from "../Strategy.js";

const candles: Candle[] = [
  {
    symbol: "QQQ",
    timeframe: "5m",
    timestamp:
      new Date("2026-01-01T14:00:00Z"),
    open: 500,
    high: 501,
    low: 499,
    close: 500,
    volume: 100_000
  },
  {
    symbol: "QQQ",
    timeframe: "5m",
    timestamp:
      new Date("2026-01-01T14:05:00Z"),
    open: 500,
    high: 511,
    low: 499,
    close: 510,
    volume: 100_000
  },
  {
    symbol: "QQQ",
    timeframe: "5m",
    timestamp:
      new Date("2026-01-01T14:10:00Z"),
    open: 510,
    high: 521,
    low: 509,
    close: 520,
    volume: 100_000
  },
  {
    symbol: "QQQ",
    timeframe: "5m",
    timestamp:
      new Date("2026-01-01T14:15:00Z"),
    open: 520,
    high: 521,
    low: 519,
    close: 520,
    volume: 100_000
  }
];

describe(
  "BacktestEngine",
  () => {
    test(
      "executes strategy orders on the next candle open",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        let callCount = 0;

        const strategy: Strategy = {
          onCandle: ({
            candle,
            history
          }) => {
            callCount++;

            if (
              history.length === 0
            ) {
              return {
                side: "buy",
                quantity: 10
              };
            }

            if (
              candle.close === 520 &&
              history.length === 2
            ) {
              return {
                side: "sell",
                quantity: 10
              };
            }

            return null;
          }
        };

        const engine =
          new BacktestEngine(
            portfolio
          );

        const result =
          engine.run(
            candles,
            strategy
          );

        expect(callCount).toBe(4);

        expect(
          result.initialCash
        ).toBe(10_000);

        expect(
          result.finalCash
        ).toBe(10_200);

        expect(
          result.finalEquity
        ).toBe(10_200);

        expect(
          result.realizedPnl
        ).toBe(200);

        expect(
          result.unrealizedPnl
        ).toBe(0);

        expect(
          result.trades
        ).toBe(2);
      }
    );

    test(
      "does not give strategy future candles",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        const historyLengths:
          number[] = [];

        const strategy: Strategy = {
          onCandle: ({
            history
          }) => {
            historyLengths.push(
              history.length
            );

            return null;
          }
        };

        const engine =
          new BacktestEngine(
            portfolio
          );

        engine.run(
          candles,
          strategy
        );

        expect(
          historyLengths
        ).toEqual([
          0,
          1,
          2,
          3
        ]);
      }
    );

    test(
      "handles an empty candle set",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        const strategy: Strategy = {
          onCandle: () => null
        };

        const engine =
          new BacktestEngine(
            portfolio
          );

        const result =
          engine.run(
            [],
            strategy
          );

        expect(
          result.initialCash
        ).toBe(10_000);

        expect(
          result.finalCash
        ).toBe(10_000);

        expect(
          result.finalEquity
        ).toBe(10_000);

        expect(
          result.trades
        ).toBe(0);
      }
    );
  }
);