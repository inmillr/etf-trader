import type { Candle } from "../types/market.js";
import type { EtfCandidate } from "../universe/EtfRank.js";
import {
  countDaysHeld,
  resolveActiveSymbols,
  type RotationPolicyOptions
} from "../universe/RotationPolicy.js";
import {
  isRebalanceDate,
  selectTopEtfsAtDate,
  type PointInTimeSelectorOptions,
  type RebalanceFrequency,
  type SelectionSnapshot
} from "../universe/PointInTimeSelector.js";
import type { EquityPoint } from "./BacktestEngine.js";
import {
  PortfolioSimulator,
  type PortfolioSimulatorOptions,
  type Trade
} from "./PortfolioSimulator.js";
import type {
  TradeContext
} from "./TradeReason.js";
import type {
  Strategy,
  StrategyOrder
} from "./Strategy.js";

export type ExecutionTiming =
  | "next-open"
  | "same-close"
  | "prior-close";

export interface MultiSymbolBacktestOptions {
  start: Date;
  end: Date;
  topCount?: number;
  selectionLookbackDays?: number;
  warmupDays?: number;
  rebalanceFrequency?: RebalanceFrequency;
  enterOnSelection?: boolean;
  /**
   * next-open: rank prior close, fill next open (old 9:35 AM).
   * prior-close: rank prior close, fill that day's close (overnight only).
   * same-close: rank and fill the same close (new 3:55 PM).
   */
  executionTiming?: ExecutionTiming;
  rotation?: RotationPolicyOptions;
  portfolio?: PortfolioSimulatorOptions;
  selector?: PointInTimeSelectorOptions;
  selectAtDate?: (
    asOfDate: Date,
    candidates: EtfCandidate[],
    candlesBySymbol: Map<string, Candle[]>,
    context: {
      topCount: number;
      lookbackDays: number;
      selector?: PointInTimeSelectorOptions;
    }
  ) => SelectionSnapshot;
}

export interface SymbolStrategyState {
  strategy: Strategy;
  history: Candle[];
  pendingOrder: StrategyOrder | null;
}

export interface MultiSymbolBacktestResult {
  initialCash: number;
  finalEquity: number;
  returnPercent: number;
  maxDrawdown: number;
  trades: number;
  exposurePercent: number;
  equityCurve: EquityPoint[];
  rebalanceCount: number;
  selections: Array<{
    date: string;
    symbols: string[];
  }>;
  tradeLog: Trade[];
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function groupCandlesByDay(
  candles: Candle[]
): Map<string, Candle> {
  const grouped = new Map<string, Candle>();

  for (const candle of candles) {
    grouped.set(
      dayKey(candle.timestamp),
      candle
    );
  }

  return grouped;
}

function collectTradingDays(
  candlesBySymbol: Map<string, Candle[]>,
  start: Date,
  end: Date
): string[] {
  const days = new Set<string>();

  for (const candles of candlesBySymbol.values()) {
    for (const candle of candles) {
      if (
        candle.timestamp >= start &&
        candle.timestamp <= end
      ) {
        days.add(
          dayKey(candle.timestamp)
        );
      }
    }
  }

  return Array.from(days).sort();
}

function parseDay(
  key: string
): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function executionPrice(
  candle: Candle,
  timing: ExecutionTiming
): number {
  return timing === "next-open"
    ? candle.open
    : candle.close;
}

export class MultiSymbolBacktestEngine {
  run(
    candidates: EtfCandidate[],
    candlesBySymbol: Map<string, Candle[]>,
    createStrategy: () => Strategy,
    options: MultiSymbolBacktestOptions
  ): MultiSymbolBacktestResult {
    const topCount =
      options.topCount ??
      options.selector?.topCount ??
      3;

    const portfolio =
      new PortfolioSimulator(
        options.portfolio ?? {
          initialCash: 1_000
        }
      );

    const candlesByDay = new Map<
      string,
      Map<string, Candle>
    >();

    for (
      const [symbol, candles] of
      candlesBySymbol.entries()
    ) {
      candlesByDay.set(
        symbol,
        groupCandlesByDay(candles)
      );
    }

    const tradingDays = collectTradingDays(
      candlesBySymbol,
      options.start,
      options.end
    );

    const equityCurve: EquityPoint[] = [];
    const selections: MultiSymbolBacktestResult["selections"] = [];

    let activeSymbols: string[] = [];
    let rebalanceCount = 0;
    let exposedDays = 0;
    let heldSymbol: string | null = null;
    let heldSinceDay: string | null = null;

    const rotation =
      options.rotation ?? {};

    const strategyStates =
      new Map<string, SymbolStrategyState>();

    const getOrCreateState = (
      symbol: string
    ): SymbolStrategyState => {
      let state =
        strategyStates.get(symbol);

      if (!state) {
        state = {
          strategy: createStrategy(),
          history: [],
          pendingOrder: null
        };

        strategyStates.set(
          symbol,
          state
        );
      }

      return state;
    };

    const rebalanceFrequency =
      options.rebalanceFrequency ??
      "weekly";

    const enterOnSelection =
      options.enterOnSelection ??
      true;

    const timing =
      options.executionTiming ??
      "next-open";

    for (const day of tradingDays) {
      const asOfDate = parseDay(day);

      const shouldRebalance =
        rebalanceCount === 0 ||
        isRebalanceDate(
          asOfDate,
          rebalanceFrequency
        );

      if (shouldRebalance) {
        const priorDate = new Date(asOfDate);

        priorDate.setUTCDate(
          priorDate.getUTCDate() - 1
        );

        const selectionAsOf =
          timing === "same-close"
            ? asOfDate
            : priorDate;

        const lookbackDays =
          options.selectionLookbackDays ??
          options.selector?.lookbackDays ??
          30;

        const selection = options.selectAtDate
          ? options.selectAtDate(
              selectionAsOf,
              candidates,
              candlesBySymbol,
              {
                topCount,
                lookbackDays,
                selector: options.selector
              }
            )
          : selectTopEtfsAtDate(
              selectionAsOf,
              candidates,
              candlesBySymbol,
              {
                ...options.selector,
                topCount,
                lookbackDays
              }
            );

        activeSymbols = resolveActiveSymbols(
          selection,
          heldSymbol,
          heldSinceDay
            ? countDaysHeld(
                heldSinceDay,
                day
              )
            : 0,
          rotation
        );

        const targetSymbol =
          activeSymbols[0] ?? null;

        rebalanceCount++;

        selections.push({
          date: day,
          symbols: [...activeSymbols]
        });

        const dayCandles = new Map<string, Candle>();
        const heldBeforeRebalance =
          heldSymbol;

        for (const symbol of candlesBySymbol.keys()) {
          const candle = candlesByDay
            .get(symbol)
            ?.get(day);

          if (candle) {
            dayCandles.set(
              symbol,
              candle
            );
          }
        }

        for (const position of portfolio.getPositions()) {
          if (
            !activeSymbols.includes(
              position.symbol
            )
          ) {
            const candle = dayCandles.get(
              position.symbol
            );

            if (candle) {
              const sellContext: TradeContext =
                targetSymbol
                  ? selection.usedFallback
                    ? {
                        reason: "SELL_ROTATION",
                        detail: `Rotate to ${targetSymbol} (${targetSymbol} fallback)`
                      }
                    : {
                        reason: "SELL_ROTATION",
                        detail: `Rotate to ${targetSymbol}`
                      }
                  : {
                      reason: "SELL_CASH",
                      detail:
                        "Absolute momentum negative — move to cash"
                    };

              portfolio.sell(
                position.symbol,
                position.quantity,
                candle,
                executionPrice(candle, timing),
                sellContext
              );

              if (heldSymbol === position.symbol) {
                heldSymbol = null;
                heldSinceDay = null;
              }
            }
          }
        }

        if (enterOnSelection) {
          for (const symbol of activeSymbols) {
            const candle = dayCandles.get(symbol);
            const position =
              portfolio.getPosition(symbol);

            if (
              !candle ||
              (position?.quantity ?? 0) > 0
            ) {
              continue;
            }

            const quantity =
              this.getAllocationLimitedQuantity(
                portfolio,
                executionPrice(candle, timing),
                portfolio.getEquity(),
                0
              );

            if (quantity > 0) {
              const buyContext: TradeContext =
                heldBeforeRebalance &&
                heldBeforeRebalance !== symbol
                  ? {
                      reason: "BUY_ROTATION",
                      detail: `Rotate from ${heldBeforeRebalance} to ${symbol}`
                    }
                  : targetSymbol === symbol &&
                      selection.usedFallback
                    ? {
                        reason: "BUY_REBALANCE",
                        detail: `Enter ${symbol} (${symbol} fallback — absolute momentum failed)`
                      }
                    : {
                        reason: "BUY_REBALANCE",
                        detail: `Weekly rebalance entry into ${symbol}`
                      };

              portfolio.buy(
                symbol,
                quantity,
                candle,
                executionPrice(candle, timing),
                buyContext
              );

              heldSymbol = symbol;
              heldSinceDay = day;
            }
          }
        }
      }

      const dayCandles = new Map<string, Candle>();

      for (const symbol of activeSymbols) {
        const candle = candlesByDay
          .get(symbol)
          ?.get(day);

        if (candle) {
          dayCandles.set(
            symbol,
            candle
          );
        }
      }

      for (const symbol of activeSymbols) {
        const state = getOrCreateState(symbol);
        const candle = dayCandles.get(symbol);

        if (!candle) {
          continue;
        }

        if (state.pendingOrder) {
          const previousQuantity =
            portfolio.getPosition(symbol)?.quantity ?? 0;

          this.executeOrder(
            portfolio,
            state.pendingOrder,
            candle,
            activeSymbols.length,
            timing
          );

          const nextQuantity =
            portfolio.getPosition(symbol)?.quantity ?? 0;

          if (
            state.pendingOrder.side === "buy" &&
            previousQuantity === 0 &&
            nextQuantity > 0
          ) {
            heldSymbol = symbol;
            heldSinceDay = day;
          }

          if (
            state.pendingOrder.side === "sell" &&
            nextQuantity === 0 &&
            heldSymbol === symbol
          ) {
            heldSymbol = null;
            heldSinceDay = null;
          }

          state.pendingOrder = null;
        }

        portfolio.updateMarket(candle);

        const position =
          portfolio.getPosition(symbol);

        const targetAllocation =
          portfolio.getEquity() /
          Math.max(
            activeSymbols.length,
            1
          );

        const estimatedBuyQuantity =
          this.getAllocationLimitedQuantity(
            portfolio,
            executionPrice(candle, timing),
            targetAllocation,
            position?.quantity ?? 0
          );

        const order = state.strategy.onCandle({
          candle,
          history: [...state.history],
          cash: portfolio.getCash(),
          positionQuantity:
            position?.quantity ?? 0,
          estimatedBuyQuantity
        });

        state.pendingOrder = order;
        state.history.push(candle);
      }

      for (const candle of dayCandles.values()) {
        portfolio.updateMarket(candle);
      }

      if (
        portfolio.getPositions().length > 0
      ) {
        exposedDays++;
      }

      const lastTimestamp = Array.from(
        dayCandles.values()
      ).sort(
        (a, b) =>
          a.timestamp.getTime() -
          b.timestamp.getTime()
      ).at(-1)?.timestamp ??
        asOfDate;

      equityCurve.push({
        timestamp: lastTimestamp,
        equity: portfolio.getEquity()
      });
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
        tradingDays.length > 0
          ? (exposedDays /
              tradingDays.length) * 100
          : 0,
      equityCurve,
      rebalanceCount,
      selections,
      tradeLog: portfolio.getTrades()
    };
  }

  private executeOrder(
    portfolio: PortfolioSimulator,
    order: StrategyOrder,
    candle: Candle,
    activeSymbolCount: number,
    timing: ExecutionTiming
  ): void {
    const fillPrice = executionPrice(
      candle,
      timing
    );

    if (order.side === "buy") {
      const targetAllocation =
        portfolio.getEquity() /
        Math.max(activeSymbolCount, 1);

      const position =
        portfolio.getPosition(
          candle.symbol
        );

      const quantity = Math.min(
        order.quantity,
        this.getAllocationLimitedQuantity(
          portfolio,
          fillPrice,
          targetAllocation,
          position?.quantity ?? 0
        )
      );

      if (quantity > 0) {
        portfolio.buy(
          candle.symbol,
          quantity,
          candle,
          fillPrice,
          {
            reason: "BUY_STRATEGY",
            detail: "Strategy buy signal"
          }
        );
      }

      return;
    }

    const position =
      portfolio.getPosition(
        candle.symbol
      );

    const availableQuantity =
      position?.quantity ?? 0;

    const quantity = Math.min(
      order.quantity,
      availableQuantity
    );

    if (quantity > 0) {
      portfolio.sell(
        candle.symbol,
        quantity,
        candle,
        fillPrice,
        {
          reason: "SELL_STRATEGY",
          detail: "Strategy sell signal"
        }
      );
    }
  }

  private getAllocationLimitedQuantity(
    portfolio: PortfolioSimulator,
    price: number,
    targetAllocation: number,
    currentQuantity: number
  ): number {
    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return 0;
    }

    const currentValue =
      currentQuantity * price;

    const remainingAllocation =
      Math.max(
        0,
        targetAllocation - currentValue
      );

    const allocationQuantity = Math.floor(
      remainingAllocation / price
    );

    return Math.min(
      portfolio.getEstimatedBuyQuantity(price),
      allocationQuantity
    );
  }
}
