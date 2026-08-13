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
  type RebalanceFrequency
} from "../universe/PointInTimeSelector.js";
import {
  evaluateDailyTrend,
  type DailyTrendOptions
} from "./DailyTrendGate.js";
import type { EquityPoint } from "./BacktestEngine.js";
import {
  checkStopTargetExit,
  closePositionAtPrice,
  dayKey
} from "./IntradayExits.js";
import {
  isIntradayStrategy,
  type IntradayStrategy
} from "../strategy/IntradayMomentumStrategy.js";
import {
  PortfolioSimulator,
  type PortfolioSimulatorOptions,
  type Trade
} from "./PortfolioSimulator.js";
import type { TradeContext } from "./TradeReason.js";
import type {
  Strategy,
  StrategyOrder
} from "./Strategy.js";

export interface MultiSymbolHybridBacktestOptions {
  start: Date;
  end: Date;
  topCount?: number;
  selectionLookbackDays?: number;
  rebalanceFrequency?: RebalanceFrequency;
  rotation?: RotationPolicyOptions;
  portfolio?: PortfolioSimulatorOptions;
  selector?: PointInTimeSelectorOptions;
  trendGate?: DailyTrendOptions;
}

export interface MultiSymbolHybridBacktestResult {
  initialCash: number;
  finalEquity: number;
  returnPercent: number;
  maxDrawdown: number;
  trades: number;
  exposurePercent: number;
  stopExits: number;
  targetExits: number;
  trendExits: number;
  rotationExits: number;
  equityCurve: EquityPoint[];
  rebalanceCount: number;
  selections: Array<{
    date: string;
    symbols: string[];
  }>;
  intradaySymbols: string[];
  tradeLog: Trade[];
}

interface SymbolIntradayState {
  strategy: Strategy;
  history: Candle[];
  pendingOrder: StrategyOrder | null;
}

function groupCandlesByDay(
  candles: Candle[]
): Map<string, Candle[]> {
  const grouped = new Map<string, Candle[]>();

  for (const candle of candles) {
    const key = dayKey(candle.timestamp);
    const dayCandles = grouped.get(key) ?? [];

    dayCandles.push(candle);
    grouped.set(key, dayCandles);
  }

  for (const dayCandles of grouped.values()) {
    dayCandles.sort(
      (a, b) =>
        a.timestamp.getTime() -
        b.timestamp.getTime()
    );
  }

  return grouped;
}

function groupDailyByDay(
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
        days.add(dayKey(candle.timestamp));
      }
    }
  }

  return Array.from(days).sort();
}

function parseDay(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export class MultiSymbolHybridBacktestEngine {
  run(
    candidates: EtfCandidate[],
    dailyCandlesBySymbol: Map<string, Candle[]>,
    intradayCandlesBySymbol: Map<string, Candle[]>,
    createStrategy: () => Strategy,
    options: MultiSymbolHybridBacktestOptions
  ): MultiSymbolHybridBacktestResult {
    const topCount =
      options.topCount ??
      options.selector?.topCount ??
      1;

    const rebalanceFrequency =
      options.rebalanceFrequency ??
      "weekly";

    const rotation =
      options.rotation ?? {};

    const trendGate =
      options.trendGate ?? {
        fastPeriod: 20,
        slowPeriod: 50
      };

    const portfolio =
      new PortfolioSimulator(
        options.portfolio ?? {
          initialCash: 1_000
        }
      );

    const dailyByDay = new Map<
      string,
      Map<string, Candle>
    >();

    for (
      const [symbol, candles] of
      dailyCandlesBySymbol.entries()
    ) {
      dailyByDay.set(
        symbol,
        groupDailyByDay(candles)
      );
    }

    const intradayByDay = new Map<
      string,
      Map<string, Candle[]>
    >();

    for (
      const [symbol, candles] of
      intradayCandlesBySymbol.entries()
    ) {
      intradayByDay.set(
        symbol,
        groupCandlesByDay(candles)
      );
    }

    const tradingDays = collectTradingDays(
      dailyCandlesBySymbol,
      options.start,
      options.end
    );

    const strategyStates =
      new Map<string, SymbolIntradayState>();

    const getState = (
      symbol: string
    ): SymbolIntradayState => {
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

    const equityCurve: EquityPoint[] = [];
    const selections: MultiSymbolHybridBacktestResult["selections"] = [];

    let activeSymbols: string[] = [];
    let rebalanceCount = 0;
    let heldSymbol: string | null = null;
    let heldSinceDay: string | null = null;
    let exposedDays = 0;

    let stopExits = 0;
    let targetExits = 0;
    let trendExits = 0;
    let rotationExits = 0;

    for (const day of tradingDays) {
      const asOfDate = parseDay(day);

      const shouldRebalance =
        activeSymbols.length === 0 ||
        isRebalanceDate(
          asOfDate,
          rebalanceFrequency
        );

      if (shouldRebalance) {
        const priorDate = new Date(asOfDate);

        priorDate.setUTCDate(
          priorDate.getUTCDate() - 1
        );

        const selection = selectTopEtfsAtDate(
          priorDate,
          candidates,
          dailyCandlesBySymbol,
          {
            ...options.selector,
            topCount,
            lookbackDays:
              options.selectionLookbackDays ??
              options.selector?.lookbackDays ??
              30
          }
        );

        const resolved = resolveActiveSymbols(
          selection,
          heldSymbol,
          heldSinceDay
            ? countDaysHeld(
                heldSinceDay,
                day
              )
            : 0,
          rotation
        ).filter((symbol) =>
          intradayCandlesBySymbol.has(symbol)
        );

        let nextActive = resolved;

        if (nextActive.length === 0) {
          const fallback = selection.scores.find(
            (entry) =>
              intradayCandlesBySymbol.has(
                entry.symbol
              )
          );

          if (fallback) {
            nextActive = [fallback.symbol];
          }
        }

        for (const position of portfolio.getPositions()) {
          if (
            !nextActive.includes(
              position.symbol
            )
          ) {
            const dailyCandle = dailyByDay
              .get(position.symbol)
              ?.get(day);

            const intradayCandles =
              intradayByDay
                .get(position.symbol)
                ?.get(day) ?? [];

            const exitCandle =
              intradayCandles[0] ??
              dailyCandle;

            if (exitCandle) {
              closePositionAtPrice(
                portfolio,
                exitCandle,
                position.quantity,
                exitCandle.open,
                {
                  reason: "SELL_ROTATION",
                  detail: `Rotate out of ${position.symbol}`
                }
              );

              const state = strategyStates.get(
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

              rotationExits++;

              if (
                heldSymbol === position.symbol
              ) {
                heldSymbol = null;
                heldSinceDay = null;
              }
            }
          }
        }

        activeSymbols = nextActive;
        rebalanceCount++;

        selections.push({
          date: day,
          symbols: [...activeSymbols]
        });

        if (
          activeSymbols[0] &&
          !portfolio.getPosition(
            activeSymbols[0]
          )?.quantity
        ) {
          heldSymbol = activeSymbols[0];
          heldSinceDay = day;
        }
      }

      const symbol =
        activeSymbols[0];

      if (!symbol) {
        equityCurve.push({
          timestamp: asOfDate,
          equity: portfolio.getEquity()
        });

        continue;
      }

      const dailyHistory =
        this.getDailyHistoryThroughPriorDay(
          dailyCandlesBySymbol.get(symbol) ?? [],
          day
        );

      const trend = evaluateDailyTrend(
        dailyHistory,
        trendGate
      );

      const intradayCandles =
        intradayByDay.get(symbol)?.get(day) ??
        [];

      const state = getState(symbol);
      let forceExit = false;

      const positionBeforeDay =
        portfolio.getPosition(symbol)?.quantity ??
        0;

      if (
        trend?.bearishCrossover &&
        positionBeforeDay > 0
      ) {
        forceExit = true;
      }

      if (intradayCandles.length === 0) {
        if (forceExit) {
          const dailyCandle = dailyByDay
            .get(symbol)
            ?.get(day);

          if (dailyCandle) {
            closePositionAtPrice(
              portfolio,
              dailyCandle,
              positionBeforeDay,
              dailyCandle.open,
              {
                reason: "SELL_SIGNAL",
                detail:
                  "Daily MA bearish crossover exit"
              }
            );

            if (
              isIntradayStrategy(
                state.strategy
              )
            ) {
              state.strategy.clearPositionRisk(
                symbol
              );
            }

            trendExits++;

            if (heldSymbol === symbol) {
              heldSymbol = null;
              heldSinceDay = null;
            }
          }
        }

        const dailyCandle = dailyByDay
          .get(symbol)
          ?.get(day);

        if (dailyCandle) {
          portfolio.updateMarket(dailyCandle);
        }

        if (
          portfolio.getPositions().length > 0
        ) {
          exposedDays++;
        }

        equityCurve.push({
          timestamp:
            dailyCandle?.timestamp ??
            asOfDate,
          equity: portfolio.getEquity()
        });

        continue;
      }

      for (const candle of intradayCandles) {
        if (forceExit) {
          const position =
            portfolio.getPosition(symbol);

          if (
            position &&
            position.quantity > 0
          ) {
            closePositionAtPrice(
              portfolio,
              candle,
              position.quantity,
              candle.open,
              {
                reason: "SELL_SIGNAL",
                detail:
                  "Daily MA bearish crossover exit"
              }
            );

            if (
              isIntradayStrategy(
                state.strategy
              )
            ) {
              state.strategy.clearPositionRisk(
                symbol
              );
            }

            trendExits++;
            forceExit = false;

            if (heldSymbol === symbol) {
              heldSymbol = null;
              heldSinceDay = null;
            }
          }
        }

        if (state.pendingOrder) {
          if (state.pendingOrder.side === "buy") {
            const allowBuy =
              trend?.bullishEntry ?? false;

            if (allowBuy) {
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
                  symbol,
                  quantity,
                  candle,
                  candle.open,
                  {
                    reason: "BUY_STRATEGY",
                    detail:
                      "5m intraday momentum entry"
                  }
                );

                heldSymbol = symbol;
                heldSinceDay = day;
              }
            }
          }

          state.pendingOrder = null;
        }

        const position =
          portfolio.getPosition(symbol);

        if (
          position &&
          position.quantity > 0 &&
          isIntradayStrategy(state.strategy)
        ) {
          const risk =
            state.strategy.getPositionRisk(
              symbol
            );

          if (risk) {
            const exit = checkStopTargetExit(
              candle,
              position.quantity,
              risk
            );

            if (exit) {
              const exitContext: TradeContext =
                exit.reason === "stop"
                  ? {
                      reason: "SELL_STOP",
                      detail: "ATR stop loss hit"
                    }
                  : {
                      reason: "SELL_TARGET",
                      detail: "ATR take profit hit"
                    };

              closePositionAtPrice(
                portfolio,
                candle,
                exit.quantity,
                exit.price,
                exitContext
              );

              state.strategy.clearPositionRisk(
                symbol
              );

              if (exit.reason === "stop") {
                stopExits++;
              } else {
                targetExits++;
              }

              if (heldSymbol === symbol) {
                heldSymbol = null;
                heldSinceDay = null;
              }
            }
          }
        }

        portfolio.updateMarket(candle);

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
              portfolio.getPosition(symbol)
                ?.quantity ?? 0,
            estimatedBuyQuantity
          });

        if (order?.side === "buy") {
          state.pendingOrder = order;
        }

        state.history.push(candle);
      }

      if (
        portfolio.getPositions().length > 0
      ) {
        exposedDays++;
      }

      const lastCandle =
        intradayCandles.at(-1);

      equityCurve.push({
        timestamp:
          lastCandle?.timestamp ??
          asOfDate,
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
      stopExits,
      targetExits,
      trendExits,
      rotationExits,
      equityCurve,
      rebalanceCount,
      selections,
      intradaySymbols: Array.from(
        intradayCandlesBySymbol.keys()
      ),
      tradeLog: portfolio.getTrades()
    };
  }

  private getDailyHistoryThroughPriorDay(
    dailyCandles: Candle[],
    day: string
  ): Candle[] {
    return dailyCandles.filter(
      (candle) =>
        dayKey(candle.timestamp) < day
    );
  }
}
