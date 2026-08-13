import {
  describe,
  expect,
  test
} from "vitest";

import {
  PortfolioSimulator
} from "../PortfolioSimulator.js";

import type {
  Candle
} from "../../types/market.js";

const candle: Candle = {
  symbol: "QQQ",
  timeframe: "5m",
  timestamp:
    new Date("2026-01-01T14:00:00Z"),
  open: 500,
  high: 502,
  low: 499,
  close: 500,
  volume: 100_000
};

describe(
  "PortfolioSimulator",
  () => {
    test(
      "starts with the configured cash",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        expect(
          portfolio.getCash()
        ).toBe(10_000);

        expect(
          portfolio.getEquity()
        ).toBe(10_000);

        expect(
          portfolio.getPositions()
        ).toEqual([]);
      }
    );

    test(
      "buys shares and updates cash",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        portfolio.buy(
          "QQQ",
          10,
          candle
        );

        expect(
          portfolio.getCash()
        ).toBe(5_000);

        expect(
          portfolio.getPosition("QQQ")
        ).toEqual({
          symbol: "QQQ",
          quantity: 10,
          averagePrice: 500
        });

        expect(
          portfolio.getMarketValue()
        ).toBe(5_000);

        expect(
          portfolio.getEquity()
        ).toBe(10_000);
      }
    );

    test(
      "sells shares and realizes profit",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        portfolio.buy(
          "QQQ",
          10,
          candle
        );

        const sellCandle: Candle = {
          ...candle,
          close: 550,
          timestamp:
            new Date(
              "2026-01-01T15:00:00Z"
            )
        };

        portfolio.sell(
          "QQQ",
          10,
          sellCandle
        );

        expect(
          portfolio.getCash()
        ).toBe(10_500);

        expect(
          portfolio.getPosition("QQQ")
        ).toBeUndefined();

        expect(
          portfolio.getRealizedPnl()
        ).toBe(500);

        expect(
          portfolio.getEquity()
        ).toBe(10_500);
      }
    );

    test(
      "tracks unrealized profit",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        portfolio.buy(
          "QQQ",
          10,
          candle
        );

        const updatedCandle: Candle = {
          ...candle,
          close: 550,
          timestamp:
            new Date(
              "2026-01-01T15:00:00Z"
            )
        };

        portfolio.updateMarket(
          updatedCandle
        );

        expect(
          portfolio.getUnrealizedPnl()
        ).toBe(500);

        expect(
          portfolio.getEquity()
        ).toBe(10_500);
      }
    );

    test(
      "applies commission",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000,
            commissionPerTrade: 10
          });

        portfolio.buy(
          "QQQ",
          10,
          candle
        );

        expect(
          portfolio.getCash()
        ).toBe(4_990);

        expect(
          portfolio.getTrades()
        ).toHaveLength(1);

        expect(
          portfolio.getTrades()[0]
            ?.commission
        ).toBe(10);
      }
    );

    test(
      "applies slippage",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000,
            slippagePercent: 1
          });

        portfolio.buy(
          "QQQ",
          10,
          candle
        );

        expect(
          portfolio.getPosition("QQQ")
            ?.averagePrice
        ).toBe(505);
      }
    );

    test(
      "rejects insufficient cash",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 1_000
          });

        expect(() =>
          portfolio.buy(
            "QQQ",
            10,
            candle
          )
        ).toThrow(
          "Insufficient cash."
        );
      }
    );

    test(
      "rejects selling more than owned",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        expect(() =>
          portfolio.sell(
            "QQQ",
            1,
            candle
          )
        ).toThrow(
          "Insufficient position."
        );
      }
    );

    test(
      "tracks trade history",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        portfolio.buy(
          "QQQ",
          5,
          candle
        );

        const sellCandle: Candle = {
          ...candle,
          close: 510,
          timestamp:
            new Date(
              "2026-01-01T15:00:00Z"
            )
        };

        portfolio.sell(
          "QQQ",
          5,
          sellCandle
        );

        expect(
          portfolio.getTrades()
        ).toHaveLength(2);

        expect(
          portfolio.getTrades()[0]
            ?.side
        ).toBe("buy");

        expect(
          portfolio.getTrades()[1]
            ?.side
        ).toBe("sell");
      }
    );

    test(
      "creates portfolio snapshots",
      () => {
        const portfolio =
          new PortfolioSimulator({
            initialCash: 10_000
          });

        portfolio.buy(
          "QQQ",
          10,
          candle
        );

        const snapshot =
          portfolio.getSnapshot(
            candle.timestamp
          );

        expect(snapshot).toEqual({
          timestamp:
            candle.timestamp,
          cash: 5_000,
          equity: 10_000,
          marketValue: 5_000,
          realizedPnl: 0,
          unrealizedPnl: 0
        });
      }
    );
  }
);