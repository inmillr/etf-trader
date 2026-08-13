import type { Candle } from "../types/market.js";
import {
  isIntradayStrategy,
  type IntradayStrategy
} from "../strategy/IntradayMomentumStrategy.js";
import type { EquityPoint } from "./BacktestEngine.js";
import {
  checkStopTargetExit,
  closePositionAtPrice,
  dayKey
} from "./IntradayExits.js";
import {
  PortfolioSimulator,
  type PortfolioSimulatorOptions
} from "./PortfolioSimulator.js";
import type {
  Strategy,
  StrategyOrder
} from "./Strategy.js";

export interface IntradayBacktestResult {
  initialCash: number;
  finalEquity: number;
  returnPercent: number;
  maxDrawdown: number;
  trades: number;
  exposurePercent: number;
  stopExits: number;
  targetExits: number;
  signalExits: number;
  endOfDayExits: number;
  equityCurve: EquityPoint[];
}

export interface IntradayBacktestOptions {
  closeAtEndOfDay?: boolean;
  portfolio?: PortfolioSimulatorOptions;
}

interface SymbolState {
  strategy: Strategy;
  history: Candle[];
  pendingOrder: StrategyOrder | null;
}

export class IntradayBacktestEngine {
  run(
    candles: Candle[],
    createStrategy: () => Strategy,
    options: IntradayBacktestOptions = {}
  ): IntradayBacktestResult {
    const closeAtEndOfDay =
      options.closeAtEndOfDay ?? true;

    const portfolio =
      new PortfolioSimulator(
        options.portfolio ?? {
          initialCash: 1_000
        }
      );

    const states =
      new Map<string, SymbolState>();

    const getState = (
      symbol: string
    ): SymbolState => {
      let state = states.get(symbol);

      if (!state) {
        state = {
          strategy: createStrategy(),
          history: [],
          pendingOrder: null
        };

        states.set(symbol, state);
      }

      return state;
    };

    const sorted = [...candles].sort(
      (a, b) =>
        a.timestamp.getTime() -
        b.timestamp.getTime()
    );

    let stopExits = 0;
    let targetExits = 0;
    let signalExits = 0;
    let endOfDayExits = 0;
    let exposedCandles = 0;

    const equityCurve: EquityPoint[] = [];
    const lastDayBySymbol =
      new Map<string, string>();

    const closeEndOfDayPositions = (
      day: string,
      dayCandles: Map<string, Candle>
    ) => {
      for (const position of portfolio.getPositions()) {
        const candle = dayCandles.get(
          position.symbol
        );

        if (!candle) {
          continue;
        }

        closePositionAtPrice(
          portfolio,
          candle,
          position.quantity,
          candle.close
        );

        const state = states.get(
          position.symbol
        );

        if (
          state &&
          isIntradayStrategy(
            state.strategy
          )
        ) {
          state.strategy.clearPositionRisk(
            position.symbol
          );
        }

        endOfDayExits++;
      }
    };

    let currentDay = "";
    let dayCandles = new Map<string, Candle>();

    for (const candle of sorted) {
      const candleDay = dayKey(
        candle.timestamp
      );

      if (
        currentDay &&
        candleDay !== currentDay
      ) {
        if (closeAtEndOfDay) {
          closeEndOfDayPositions(
            currentDay,
            dayCandles
          );
        }

        dayCandles = new Map();
      }

      currentDay = candleDay;
      dayCandles.set(
        candle.symbol,
        candle
      );

      const state = getState(
        candle.symbol
      );

      if (state.pendingOrder) {
        if (state.pendingOrder.side === "buy") {
          const affordableQuantity =
            portfolio.getEstimatedBuyQuantity(
              candle.open
            );

          const quantity = Math.min(
            state.pendingOrder.quantity,
            affordableQuantity
          );

          if (quantity > 0) {
            portfolio.buy(
              candle.symbol,
              quantity,
              candle,
              candle.open
            );
          }
        } else {
          const position =
            portfolio.getPosition(
              candle.symbol
            );

          const quantity = Math.min(
            state.pendingOrder.quantity,
            position?.quantity ?? 0
          );

          if (quantity > 0) {
            portfolio.sell(
              candle.symbol,
              quantity,
              candle,
              candle.open
            );

            if (
              isIntradayStrategy(
                state.strategy
              )
            ) {
              state.strategy.clearPositionRisk(
                candle.symbol
              );
            }

            signalExits++;
          }
        }

        state.pendingOrder = null;
      }

      const position =
        portfolio.getPosition(
          candle.symbol
        );

      if (
        position &&
        position.quantity > 0 &&
        isIntradayStrategy(state.strategy)
      ) {
        const risk =
          state.strategy.getPositionRisk(
            candle.symbol
          );

        if (risk) {
          const exit = checkStopTargetExit(
            candle,
            position.quantity,
            risk
          );

          if (exit) {
            closePositionAtPrice(
              portfolio,
              candle,
              exit.quantity,
              exit.price
            );

            state.strategy.clearPositionRisk(
              candle.symbol
            );

            if (exit.reason === "stop") {
              stopExits++;
            } else {
              targetExits++;
            }
          }
        }
      }

      portfolio.updateMarket(candle);

      if (
        portfolio.getPosition(
          candle.symbol
        )?.quantity
      ) {
        exposedCandles++;
      }

      const estimatedBuyQuantity =
        portfolio.getEstimatedBuyQuantity(
          candle.close
        );

      const order =
        state.strategy.onCandle({
          candle,
          history: [...state.history],
          cash: portfolio.getCash(),
          positionQuantity:
            portfolio.getPosition(
              candle.symbol
            )?.quantity ?? 0,
          estimatedBuyQuantity
        });

      state.pendingOrder = order;
      state.history.push(candle);

      lastDayBySymbol.set(
        candle.symbol,
        candleDay
      );

      equityCurve.push({
        timestamp: candle.timestamp,
        equity: portfolio.getEquity()
      });
    }

    if (closeAtEndOfDay && dayCandles.size > 0) {
      closeEndOfDayPositions(
        currentDay,
        dayCandles
      );
    }

    const initialCash =
      portfolio.getInitialCash();

    const finalEquity =
      equityCurve.at(-1)?.equity ??
      portfolio.getEquity();

    return {
      initialCash,
      finalEquity,
      returnPercent:
        ((finalEquity - initialCash) /
          initialCash) * 100,
      maxDrawdown:
        portfolio.getMaxDrawdown(),
      trades:
        portfolio.getTrades().length,
      exposurePercent:
        sorted.length > 0
          ? (exposedCandles /
              sorted.length) * 100
          : 0,
      stopExits,
      targetExits,
      signalExits,
      endOfDayExits,
      equityCurve
    };
  }
}
