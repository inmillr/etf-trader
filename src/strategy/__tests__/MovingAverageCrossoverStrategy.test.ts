import {
  describe,
  expect,
  test
} from "vitest";

import {
  MovingAverageCrossoverStrategy
} from "../MovingAverageCrossoverStrategy.js";

import type {
  Candle
} from "../../types/market.js";

function candle(
  close: number,
  index: number
): Candle {
  return {
    symbol: "QQQ",
    timeframe: "5m",
    timestamp: new Date(
      Date.UTC(
        2026,
        0,
        1,
        14,
        index * 5
      )
    ),
    open: close,
    high: close,
    low: close,
    close,
    volume: 100_000
  };
}

describe(
  "MovingAverageCrossoverStrategy",
  () => {
    test(
      "waits until enough history exists",
      () => {
        const strategy =
          new MovingAverageCrossoverStrategy({
            fastPeriod: 2,
            slowPeriod: 4
          });

        const result =
          strategy.onCandle({
            candle: candle(100, 0),
            history: [
              candle(99, -2),
              candle(100, -1)
            ],
            cash: 10_000,
            positionQuantity: 0,
            estimatedBuyQuantity: 10
          });

        expect(result).toBeNull();
      }
    );

    test(
      "buys on a bullish crossover",
      () => {
        const strategy =
          new MovingAverageCrossoverStrategy({
            fastPeriod: 2,
            slowPeriod: 4
          });

        const history = [
          candle(100, 0),
          candle(100, 1),
          candle(100, 2),
          candle(100, 3),
          candle(100, 4)
        ];

        const result =
          strategy.onCandle({
            candle: candle(110, 5),
            history,
            cash: 10_000,
            positionQuantity: 0,
            estimatedBuyQuantity: 10
          });

        expect(result).toEqual({
          side: "buy",
          quantity: 10
        });
      }
    );

    test(
      "sells on a bearish crossover",
      () => {
        const strategy =
          new MovingAverageCrossoverStrategy({
            fastPeriod: 2,
            slowPeriod: 4
          });

        const history = [
          candle(110, 0),
          candle(110, 1),
          candle(110, 2),
          candle(110, 3),
          candle(110, 4)
        ];

        const result =
          strategy.onCandle({
            candle: candle(90, 5),
            history,
            cash: 5_000,
            positionQuantity: 10,
            estimatedBuyQuantity: 10
          });

        expect(result).toEqual({
          side: "sell",
          quantity: 10
        });
      }
    );

    test(
      "does not buy when already holding a position",
      () => {
        const strategy =
          new MovingAverageCrossoverStrategy({
            fastPeriod: 2,
            slowPeriod: 4
          });

        const result =
          strategy.onCandle({
            candle: candle(110, 5),
            history: [
              candle(100, 0),
              candle(100, 1),
              candle(100, 2),
              candle(100, 3),
              candle(100, 4)
            ],
            cash: 5_000,
            positionQuantity: 10,
            estimatedBuyQuantity: 10
          });

        expect(result).toBeNull();
      }
    );

    test(
      "does not sell when no position exists",
      () => {
        const strategy =
          new MovingAverageCrossoverStrategy({
            fastPeriod: 2,
            slowPeriod: 4
          });

        const result =
          strategy.onCandle({
            candle: candle(90, 5),
            history: [
              candle(110, 0),
              candle(110, 1),
              candle(110, 2),
              candle(110, 3),
              candle(110, 4)
            ],
            cash: 10_000,
            positionQuantity: 0,
            estimatedBuyQuantity: 10
          });

        expect(result).toBeNull();
      }
    );

    test(
      "rejects invalid periods",
      () => {
        expect(
          () =>
            new MovingAverageCrossoverStrategy({
              fastPeriod: 5,
              slowPeriod: 5
            })
        ).toThrow(
          "fastPeriod must be less than slowPeriod."
        );
      }
    );
  }
);