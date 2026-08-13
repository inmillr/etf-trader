import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { MultiSymbolBacktestEngine } from "../backtest/MultiSymbolBacktestEngine.js";
import { calculatePeriodReturnMetrics } from "../backtest/ReturnMetrics.js";
import { DEFAULT_PORTFOLIO } from "../config/PortfolioConfig.js";
import {
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_ROTATION_POLICY,
  TUNED_UNIVERSE_FILTER
} from "../config/StrategyConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import { aggregateToDailyCandles } from "../market/DailyCandleAggregator.js";
import { HoldStrategy } from "../strategy/HoldStrategy.js";
import type { Candle } from "../types/market.js";
import {
  evaluateDualMomentumSignal,
  findLatestTradingDay,
  type DualMomentumSignalResult
} from "../signals/DualMomentumSignal.js";
import { selectDualMomentumAtDate } from "../universe/DualMomentumSelector.js";
import {
  LIQUID_ETF_UNIVERSE,
  StaticUniverseProvider
} from "../universe/EtfUniverse.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";

export interface SignalState {
  symbol: string;
  since: string;
}

export interface DashboardSignalResponse
  extends DualMomentumSignalResult {
  heldSinceDay: string | null;
}

export interface DashboardBacktestResponse {
  start: string;
  end: string;
  lookbackDays: number;
  initialCash: number;
  finalEquity: number;
  returnPercent: number;
  maxDrawdown: number;
  trades: number;
  exposurePercent: number;
  cashRebalances: number;
  spyReturn: number;
  metrics: ReturnType<
    typeof calculatePeriodReturnMetrics
  >;
  equityCurve: Array<{
    date: string;
    equity: number;
  }>;
  selections: Array<{
    date: string;
    symbols: string[];
  }>;
}

export interface JournalEntry {
  date: string;
  equity: number;
  dayReturnPercent: number;
  position: string;
  rebalance: boolean;
}

export interface DashboardJournalResponse {
  start: string;
  end: string;
  entries: JournalEntry[];
  summary: {
    returnPercent: number;
    maxDrawdown: number;
    trades: number;
  };
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolveProjectRoot(): string {
  if (process.env.PROJECT_ROOT) {
    return path.resolve(
      process.env.PROJECT_ROOT
    );
  }

  const cwd = process.cwd();

  if (
    existsSync(
      path.join(cwd, "data/market.db")
    )
  ) {
    return cwd;
  }

  const parent = path.join(cwd, "..");

  if (
    existsSync(
      path.join(parent, "data/market.db")
    )
  ) {
    return parent;
  }

  return cwd;
}

export class StrategyDashboardService {
  private readonly projectRoot =
    resolveProjectRoot();

  private readonly databasePath =
    process.env.DATABASE_PATH ??
    path.join(
      this.projectRoot,
      "data/market.db"
    );

  private readonly statePath =
    process.env.SIGNAL_STATE_PATH ??
    path.join(
      this.projectRoot,
      "data/signal-state.json"
    );

  loadSignalState(): SignalState | null {
    try {
      const parsed = JSON.parse(
        readFileSync(
          this.statePath,
          "utf8"
        )
      ) as SignalState;

      if (
        !parsed.symbol ||
        !parsed.since
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  async getSignal(
    options: {
      date?: string;
      lookbackDays?: number;
      heldSymbol?: string | null;
      heldSinceDay?: string | null;
    } = {}
  ): Promise<DashboardSignalResponse> {
    const lookbackDays =
      options.lookbackDays ??
      DEFAULT_LOOKBACK_DAYS;

    const savedState =
      this.loadSignalState();

    const heldSymbol =
      options.heldSymbol !== undefined
        ? options.heldSymbol
        : savedState?.symbol ?? null;

    const heldSinceDay =
      options.heldSinceDay !== undefined
        ? options.heldSinceDay
        : savedState?.since ?? null;

    const {
      candlesBySymbol,
      availableCandidates
    } = await this.loadUniverseData(
      lookbackDays,
      options.date
    );

    const signalDay =
      options.date ??
      findLatestTradingDay(
        candlesBySymbol
      );

    if (!signalDay) {
      throw new Error(
        "No daily candles found in SQLite."
      );
    }

    const signal =
      evaluateDualMomentumSignal(
        signalDay,
        availableCandidates,
        candlesBySymbol,
        {
          lookbackDays,
          rotation: DEFAULT_ROTATION_POLICY,
          selector: {
            lookbackDays,
            filter: TUNED_UNIVERSE_FILTER
          },
          heldSymbol,
          heldSinceDay
        }
      );

    return {
      ...signal,
      heldSinceDay
    };
  }

  async getBacktest(
    startString: string,
    endString: string,
    lookbackDays = DEFAULT_LOOKBACK_DAYS
  ): Promise<DashboardBacktestResponse> {
    const start = new Date(startString);
    const end = new Date(endString);

    const {
      candlesBySymbol,
      availableCandidates
    } = await this.loadUniverseData(
      lookbackDays,
      endString,
      startString
    );

    const engine =
      new MultiSymbolBacktestEngine();

    const result = engine.run(
      availableCandidates,
      candlesBySymbol,
      () => new HoldStrategy(),
      {
        start,
        end,
        topCount: 1,
        selectionLookbackDays: lookbackDays,
        rebalanceFrequency: "weekly",
        enterOnSelection: true,
        rotation: DEFAULT_ROTATION_POLICY,
        portfolio: DEFAULT_PORTFOLIO,
        selector: {
          benchmarkSymbol: "SPY",
          lookbackDays,
          topCount: 1,
          weights: DEFAULT_SCORING_WEIGHTS,
          filter: TUNED_UNIVERSE_FILTER
        },
        selectAtDate: (
          asOfDate,
          available,
          candles,
          context
        ) =>
          selectDualMomentumAtDate(
            asOfDate,
            available,
            candles,
            {
              lookbackDays,
              topCount: context.topCount,
              filter: TUNED_UNIVERSE_FILTER
            }
          )
      }
    );

    const metrics =
      calculatePeriodReturnMetrics(
        result.equityCurve
      );

    const spyCandles =
      (candlesBySymbol.get("SPY") ?? [])
        .filter(
          (candle) =>
            candle.timestamp >= start &&
            candle.timestamp <= end
        );

    const spyStart =
      spyCandles[0]?.close ?? 0;

    const spyEnd =
      spyCandles.at(-1)?.close ?? 0;

    const spyReturn =
      spyStart > 0
        ? ((spyEnd - spyStart) / spyStart) * 100
        : 0;

    return {
      start: startString,
      end: endString,
      lookbackDays,
      initialCash: result.initialCash,
      finalEquity: result.finalEquity,
      returnPercent: result.returnPercent,
      maxDrawdown: result.maxDrawdown,
      trades: result.trades,
      exposurePercent: result.exposurePercent,
      cashRebalances:
        result.selections.filter(
          (selection) =>
            selection.symbols.length === 0
        ).length,
      spyReturn,
      metrics,
      equityCurve: result.equityCurve.map(
        (point) => ({
          date: dayKey(point.timestamp),
          equity: point.equity
        })
      ),
      selections: result.selections
    };
  }

  async getJournal(
    startString: string,
    endString: string,
    lookbackDays = DEFAULT_LOOKBACK_DAYS
  ): Promise<DashboardJournalResponse> {
    const backtest =
      await this.getBacktest(
        startString,
        endString,
        lookbackDays
      );

    const rebalanceDays = new Set(
      backtest.selections.map(
        (selection) => selection.date
      )
    );

    let previousEquity =
      backtest.initialCash;

    const entries: JournalEntry[] = [];

    for (const point of backtest.equityCurve) {
      const dayReturnPercent =
        previousEquity > 0
          ? ((point.equity -
              previousEquity) /
              previousEquity) * 100
          : 0;

      entries.push({
        date: point.date,
        equity: point.equity,
        dayReturnPercent,
        position: activeSymbolOnDay(
          point.date,
          backtest.selections
        ),
        rebalance: rebalanceDays.has(
          point.date
        )
      });

      previousEquity = point.equity;
    }

    return {
      start: startString,
      end: endString,
      entries,
      summary: {
        returnPercent: backtest.returnPercent,
        maxDrawdown: backtest.maxDrawdown,
        trades: backtest.trades
      }
    };
  }

  private async loadUniverseData(
    lookbackDays: number,
    endDateString?: string,
    startDateString?: string
  ): Promise<{
    candlesBySymbol: Map<string, Candle[]>;
    availableCandidates: ReturnType<
      StaticUniverseProvider["getCandidates"]
    > extends Promise<infer T>
      ? T
      : never;
  }> {
    const repository =
      new SQLiteCandleRepository(
        this.databasePath
      );

    try {
      const loader = new BacktestDataLoader(
        repository
      );

      const provider =
        new StaticUniverseProvider(
          LIQUID_ETF_UNIVERSE
        );

      const candidates =
        await provider.getCandidates();

      const end = endDateString
        ? new Date(`${endDateString}T23:59:59.999Z`)
        : new Date();

      const dataStart = new Date(end);

      if (startDateString) {
        dataStart.setTime(
          new Date(
            `${startDateString}T00:00:00.000Z`
          ).getTime()
        );

        dataStart.setUTCDate(
          dataStart.getUTCDate() -
          lookbackDays -
          35
        );
      } else {
        dataStart.setUTCDate(
          dataStart.getUTCDate() -
          (lookbackDays + 252)
        );
      }

      const candlesBySymbol =
        new Map<string, Candle[]>();

      for (const candidate of candidates) {
        candlesBySymbol.set(
          candidate.symbol,
          await this.loadDailyCandles(
            loader,
            candidate.symbol,
            dataStart,
            end
          )
        );
      }

      candlesBySymbol.set(
        "SPY",
        await this.loadDailyCandles(
          loader,
          "SPY",
          dataStart,
          end
        )
      );

      const availableCandidates =
        candidates.filter((candidate) =>
          (candlesBySymbol.get(
            candidate.symbol
          )?.length ?? 0) > 0
        );

      return {
        candlesBySymbol,
        availableCandidates
      };
    } finally {
      repository.close();
    }
  }

  private async loadDailyCandles(
    loader: BacktestDataLoader,
    symbol: string,
    rangeStart: Date,
    rangeEnd: Date
  ): Promise<Candle[]> {
    let candles = await loader.load({
      symbol,
      timeframe: "1d",
      start: rangeStart,
      end: rangeEnd
    });

    if (candles.length === 0) {
      const intraday = await loader.load({
        symbol,
        timeframe: "5m",
        start: rangeStart,
        end: rangeEnd
      });

      candles = aggregateToDailyCandles(
        intraday
      );
    }

    return candles;
  }
}

function activeSymbolOnDay(
  day: string,
  selections: Array<{
    date: string;
    symbols: string[];
  }>
): string {
  let symbol = "(cash)";

  for (const selection of selections) {
    if (selection.date > day) {
      break;
    }

    symbol =
      selection.symbols[0] ?? "(cash)";
  }

  return symbol;
}
