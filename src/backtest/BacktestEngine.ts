import type { Candle } from "../types/market.js";

import {
  PortfolioSimulator
} from "./PortfolioSimulator.js";

import type {
  Strategy,
  StrategyOrder
} from "./Strategy.js";

export interface EquityPoint {
  timestamp: Date;
  equity: number;
}

export interface BacktestResult {
  initialCash: number;
  finalCash: number;
  finalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  trades: number;
  maxDrawdown: number;
  exposurePercent: number;

  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWinningTrade: number;
  averageLosingTrade: number;
  profitFactor: number;

  equityCurve: EquityPoint[];
}

export class BacktestEngine {
  constructor(
    private readonly portfolio: PortfolioSimulator
  ) {}

  run(
    candles: Candle[],
    strategy: Strategy
  ): BacktestResult {
    const history: Candle[] = [];

    let pendingOrder: StrategyOrder | null = null;

    let exposedCandles = 0;

    const equityCurve: EquityPoint[] = [];

    for (const candle of candles) {
      /*
       * =========================================================
       * EXECUTE PREVIOUS SIGNAL
       * =========================================================
       *
       * The strategy generates a signal using the previous
       * candle's completed information.
       *
       * That signal executes at the current candle's OPEN.
       *
       * This prevents look-ahead bias.
       */
      if (pendingOrder) {
        if (pendingOrder.side === "buy") {
          const affordableQuantity =
            this.portfolio.getEstimatedBuyQuantity(
              candle.open
            );

          const quantity =
            Math.min(
              pendingOrder.quantity,
              affordableQuantity
            );

          if (quantity > 0) {
            this.portfolio.buy(
              candle.symbol,
              quantity,
              candle,
              candle.open
            );
          }
        } else {
          /*
           * Sell the requested quantity at the
           * current candle's opening price.
           */
          const position =
            this.portfolio.getPosition(
              candle.symbol
            );

          const availableQuantity =
            position?.quantity ?? 0;

          const quantity =
            Math.min(
              pendingOrder.quantity,
              availableQuantity
            );

          if (quantity > 0) {
            this.portfolio.sell(
              candle.symbol,
              quantity,
              candle,
              candle.open
            );
          }
        }

        pendingOrder = null;
      }

      /*
       * =========================================================
       * MARK PORTFOLIO TO MARKET
       * =========================================================
       *
       * After execution at the current open, mark the portfolio
       * to the current candle's closing price.
       */
      this.portfolio.updateMarket(
        candle
      );

      /*
       * Determine whether the strategy is currently exposed.
       */
      const position =
        this.portfolio.getPosition(
          candle.symbol
        );

      if (
        position &&
        position.quantity > 0
      ) {
        exposedCandles++;
      }

      /*
       * =========================================================
       * RECORD EQUITY CURVE
       * =========================================================
       *
       * This gives us a complete equity history so we can later
       * calculate:
       *
       * - weekly returns
       * - monthly returns
       * - volatility
       * - Sharpe-like metrics
       * - profit consistency
       * - worst weekly loss
       * - rolling returns
       */
      equityCurve.push({
        timestamp:
          candle.timestamp,
        equity:
          this.portfolio.getEquity()
      });

      /*
       * =========================================================
       * GENERATE CURRENT SIGNAL
       * =========================================================
       *
       * The strategy sees the completed current candle.
       *
       * IMPORTANT:
       *
       * The resulting order is NOT executed here.
       *
       * It becomes pending and executes at the NEXT candle's
       * opening price.
       */
      const estimatedBuyQuantity =
        this.portfolio.getEstimatedBuyQuantity(
          candle.close
        );

      const order =
        strategy.onCandle({
          candle,

          history: [
            ...history
          ],

          cash:
            this.portfolio.getCash(),

          positionQuantity:
            position?.quantity ?? 0,

          estimatedBuyQuantity
        });

      pendingOrder =
        order;

      history.push(
        candle
      );
    }

    /*
     * =========================================================
     * FINAL EQUITY
     * =========================================================
     *
     * We deliberately do NOT execute the final pending order.
     *
     * The final signal was generated from the final candle's
     * close, but there is no subsequent candle on which to
     * execute that signal.
     */
    const lastCandle =
      candles[
        candles.length - 1
      ];

    const finalEquity =
      lastCandle
        ? this.portfolio.getEquity()
        : this.portfolio.getCash();

    /*
     * =========================================================
     * EXPOSURE
     * =========================================================
     */
    const exposurePercent =
      candles.length > 0
        ? (
            exposedCandles /
            candles.length
          ) * 100
        : 0;

    /*
     * =========================================================
     * RESULT
     * =========================================================
     */
    return {
      initialCash:
        this.portfolio.getInitialCash(),

      finalCash:
        this.portfolio.getCash(),

      finalEquity,

      realizedPnl:
        this.portfolio.getRealizedPnl(),

      unrealizedPnl:
        this.portfolio.getUnrealizedPnl(),

      trades:
        this.portfolio.getTrades().length,

      maxDrawdown:
        this.portfolio.getMaxDrawdown(),

      winningTrades:
        this.portfolio.getWinningTrades(),

      losingTrades:
        this.portfolio.getLosingTrades(),

      winRate:
        this.portfolio.getWinRate(),

      averageWinningTrade:
        this.portfolio.getAverageWinningTrade(),

      averageLosingTrade:
        this.portfolio.getAverageLosingTrade(),

      profitFactor:
        this.portfolio.getProfitFactor(),

      exposurePercent,

      equityCurve
    };
  }
}