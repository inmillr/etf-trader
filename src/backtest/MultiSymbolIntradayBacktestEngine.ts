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
import type { EquityPoint } from "./BacktestEngine.js";
import { dayKey } from "./IntradayExits.js";
import {
  IntradayBacktestEngine,
  type IntradayBacktestResult
} from "./IntradayBacktestEngine.js";
import type { PortfolioSimulatorOptions } from "./PortfolioSimulator.js";
import type { Strategy } from "./Strategy.js";

export interface MultiSymbolIntradayBacktestOptions {
  start: Date;
  end: Date;
  topCount?: number;
  selectionLookbackDays?: number;
  rebalanceFrequency?: RebalanceFrequency;
  rotation?: RotationPolicyOptions;
  closeAtEndOfDay?: boolean;
  portfolio?: PortfolioSimulatorOptions;
  selector?: PointInTimeSelectorOptions;
}

export interface MultiSymbolIntradayBacktestResult
  extends IntradayBacktestResult {
  rebalanceCount: number;
  selections: Array<{
    date: string;
    symbols: string[];
  }>;
  intradaySymbols: string[];
}

function getWeekStartKey(
  date: Date
): string {
  const day = date.getUTCDay();
  const daysFromMonday =
    day === 0 ? 6 : day - 1;

  const weekStart = new Date(date);

  weekStart.setUTCDate(
    date.getUTCDate() - daysFromMonday
  );

  weekStart.setUTCHours(0, 0, 0, 0);

  return weekStart.toISOString().slice(0, 10);
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

export class MultiSymbolIntradayBacktestEngine {
  run(
    candidates: EtfCandidate[],
    dailyCandlesBySymbol: Map<string, Candle[]>,
    intradayCandlesBySymbol: Map<string, Candle[]>,
    createStrategy: () => Strategy,
    options: MultiSymbolIntradayBacktestOptions
  ): MultiSymbolIntradayBacktestResult {
    const topCount =
      options.topCount ??
      options.selector?.topCount ??
      1;

    const rebalanceFrequency =
      options.rebalanceFrequency ??
      "weekly";

    const rotation =
      options.rotation ?? {};

    const tradingDays = collectTradingDays(
      dailyCandlesBySymbol,
      options.start,
      options.end
    );

    const activeSymbolsByWeek =
      new Map<string, string[]>();

    const selections: MultiSymbolIntradayBacktestResult["selections"] = [];

    let activeSymbols: string[] = [];
    let rebalanceCount = 0;
    let heldSymbol: string | null = null;
    let heldSinceDay: string | null = null;

    for (const day of tradingDays) {
      const asOfDate = parseDay(day);

      const shouldRebalance =
        activeSymbols.length === 0 ||
        isRebalanceDate(
          asOfDate,
          rebalanceFrequency
        );

      if (!shouldRebalance) {
        continue;
      }

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

      let resolved = resolveActiveSymbols(
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

      if (resolved.length === 0) {
        const fallback = selection.scores.find(
          (entry) =>
            intradayCandlesBySymbol.has(
              entry.symbol
            )
        );

        if (fallback) {
          resolved = [fallback.symbol];
        }
      }

      if (resolved.length === 0) {
        continue;
      }

      activeSymbols = resolved;

      rebalanceCount++;

      selections.push({
        date: day,
        symbols: [...activeSymbols]
      });

      const weekStart = getWeekStartKey(asOfDate);

      activeSymbolsByWeek.set(
        weekStart,
        activeSymbols
      );

      heldSymbol = activeSymbols[0] ?? null;
      heldSinceDay = heldSymbol ? day : null;
    }

    const filteredIntraday: Candle[] = [];

    for (
      const [symbol, candles] of
      intradayCandlesBySymbol.entries()
    ) {
      for (const candle of candles) {
        if (
          candle.timestamp < options.start ||
          candle.timestamp > options.end
        ) {
          continue;
        }

        const weekStart = getWeekStartKey(
          candle.timestamp
        );

        const allowed =
          activeSymbolsByWeek.get(
            weekStart
          ) ?? [];

        if (allowed.includes(symbol)) {
          filteredIntraday.push(candle);
        }
      }
    }

    const engine =
      new IntradayBacktestEngine();

    const intradayOptions: {
      closeAtEndOfDay: boolean;
      portfolio?: PortfolioSimulatorOptions;
    } = {
      closeAtEndOfDay:
        options.closeAtEndOfDay ?? true
    };

    if (options.portfolio) {
      intradayOptions.portfolio =
        options.portfolio;
    }

    const result = engine.run(
      filteredIntraday,
      createStrategy,
      intradayOptions
    );

    const dailyEquity =
      this.buildDailyEquityCurve(
        result.equityCurve
      );

    return {
      ...result,
      equityCurve: dailyEquity,
      rebalanceCount,
      selections,
      intradaySymbols: Array.from(
        intradayCandlesBySymbol.keys()
      )
    };
  }

  private buildDailyEquityCurve(
    equityCurve: EquityPoint[]
  ): EquityPoint[] {
    const dailyEquity =
      new Map<string, EquityPoint>();

    for (const point of equityCurve) {
      const key = dayKey(point.timestamp);

      dailyEquity.set(key, point);
    }

    return Array.from(
      dailyEquity.values()
    ).sort(
      (a, b) =>
        a.timestamp.getTime() -
        b.timestamp.getTime()
    );
  }
}
