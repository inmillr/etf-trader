import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { MultiSymbolHybridBacktestEngine } from "../backtest/MultiSymbolHybridBacktestEngine.js";
import { calculatePeriodReturnMetrics } from "../backtest/ReturnMetrics.js";
import type { Trade } from "../backtest/PortfolioSimulator.js";
import {
  formatTradeReason,
  type TradeReason
} from "../backtest/TradeReason.js";
import { DEFAULT_PORTFOLIO } from "../config/PortfolioConfig.js";
import {
  HYBRID_INTRADAY_OPTIONS,
  HYBRID_ROTATION_POLICY,
  HYBRID_SELECTION_LOOKBACK_DAYS,
  HYBRID_TREND_GATE,
  HYBRID_WARMUP_DAYS,
  TUNED_UNIVERSE_FILTER
} from "../config/StrategyConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import { aggregateToDailyCandles } from "../market/DailyCandleAggregator.js";
import {
  evaluateHybridSignal,
  findLatestTradingDay,
  type HybridSignalResult
} from "../signals/HybridSignal.js";
import {
  IntradayMomentumStrategy,
  HYBRID_INTRADAY_OPTIONS
} from "../strategy/IntradayMomentumStrategy.js";
import type { Candle, Timeframe } from "../types/market.js";
import { StaticUniverseProvider, LIQUID_ETF_UNIVERSE } from "../universe/EtfUniverse.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";

export interface SignalState {
  symbol: string;
  since: string;
}

export interface DashboardSignalResponse
  extends HybridSignalResult {
  heldSinceDay: string | null;
}

export interface DashboardTrade {
  id: string;
  date: string;
  side: "buy" | "sell";
  symbol: string;
  quantity: number;
  price: number;
  commission: number;
  reason: TradeReason;
  reasonLabel: string;
  detail?: string;
}

export interface DashboardBacktestResponse {
  strategy: "hybrid";
  start: string;
  end: string;
  lookbackDays: number;
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
  tradeLog: DashboardTrade[];
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
  trades: DashboardTrade[];
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
      HYBRID_SELECTION_LOOKBACK_DAYS;

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
      dailyCandlesBySymbol,
      intradayCandlesBySymbol,
      availableCandidates
    } = await this.loadHybridData({
      endDateString: options.date,
      intradayStartString:
        options.date
    });

    const signalDay =
      options.date ??
      findLatestTradingDay(
        dailyCandlesBySymbol
      );

    if (!signalDay) {
      throw new Error(
        "No daily candles found in SQLite."
      );
    }

    const signal = evaluateHybridSignal(
      signalDay,
      availableCandidates,
      dailyCandlesBySymbol,
      intradayCandlesBySymbol,
      {
        lookbackDays,
        rotation: HYBRID_ROTATION_POLICY,
        trendGate: HYBRID_TREND_GATE,
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
    lookbackDays = HYBRID_SELECTION_LOOKBACK_DAYS
  ): Promise<DashboardBacktestResponse> {
    const start = new Date(startString);
    const end = new Date(endString);

    const {
      dailyCandlesBySymbol,
      intradayCandlesBySymbol,
      availableCandidates
    } = await this.loadHybridData({
      startDateString: startString,
      endDateString: endString,
      intradayStartString: startString,
      intradayEndString: endString
    });

    const engine =
      new MultiSymbolHybridBacktestEngine();

    const result = engine.run(
      availableCandidates,
      dailyCandlesBySymbol,
      intradayCandlesBySymbol,
      () =>
        new IntradayMomentumStrategy(
          HYBRID_INTRADAY_OPTIONS
        ),
      {
        start,
        end,
        topCount: 1,
        selectionLookbackDays: lookbackDays,
        rebalanceFrequency: "weekly",
        rotation: HYBRID_ROTATION_POLICY,
        portfolio: DEFAULT_PORTFOLIO,
        selector: {
          benchmarkSymbol: "SPY",
          lookbackDays,
          topCount: 1,
          weights: DEFAULT_SCORING_WEIGHTS,
          filter: TUNED_UNIVERSE_FILTER
        },
        trendGate: HYBRID_TREND_GATE
      }
    );

    const metrics =
      calculatePeriodReturnMetrics(
        result.equityCurve
      );

    const spyCandles =
      (dailyCandlesBySymbol.get("SPY") ?? [])
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
      strategy: "hybrid",
      start: startString,
      end: endString,
      lookbackDays,
      initialCash: result.initialCash,
      finalEquity: result.finalEquity,
      returnPercent: result.returnPercent,
      maxDrawdown: result.maxDrawdown,
      trades: result.trades,
      exposurePercent: result.exposurePercent,
      stopExits: result.stopExits,
      targetExits: result.targetExits,
      trendExits: result.trendExits,
      rotationExits: result.rotationExits,
      spyReturn,
      metrics,
      equityCurve: result.equityCurve.map(
        (point) => ({
          date: dayKey(point.timestamp),
          equity: point.equity
        })
      ),
      selections: result.selections,
      tradeLog: serializeTrades(
        result.tradeLog
      )
    };
  }

  async getJournal(
    startString: string,
    endString: string,
    lookbackDays = HYBRID_SELECTION_LOOKBACK_DAYS
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
      trades: backtest.tradeLog,
      summary: {
        returnPercent: backtest.returnPercent,
        maxDrawdown: backtest.maxDrawdown,
        trades: backtest.trades
      }
    };
  }

  private async loadHybridData(options: {
    startDateString?: string;
    endDateString?: string;
    intradayStartString?: string;
    intradayEndString?: string;
  }): Promise<{
    dailyCandlesBySymbol: Map<string, Candle[]>;
    intradayCandlesBySymbol: Map<
      string,
      Candle[]
    >;
    availableCandidates: Awaited<
      ReturnType<
        StaticUniverseProvider["getCandidates"]
      >
    >;
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

      const end = options.endDateString
        ? new Date(
            `${options.endDateString}T23:59:59.999Z`
          )
        : new Date();

      const dailyStart = new Date(end);

      if (options.startDateString) {
        dailyStart.setTime(
          new Date(
            `${options.startDateString}T00:00:00.000Z`
          ).getTime()
        );

        dailyStart.setUTCDate(
          dailyStart.getUTCDate() -
            HYBRID_WARMUP_DAYS
        );
      } else {
        dailyStart.setUTCDate(
          dailyStart.getUTCDate() -
            (HYBRID_WARMUP_DAYS + 252)
        );
      }

      const intradayStart =
        options.intradayStartString
          ? new Date(
              `${options.intradayStartString}T00:00:00.000Z`
            )
          : new Date(dailyStart);

      const intradayEnd =
        options.intradayEndString
          ? new Date(
              `${options.intradayEndString}T23:59:59.999Z`
            )
          : end;

      const symbols = [
        ...new Set([
          ...candidates.map(
            (candidate) => candidate.symbol
          ),
          "SPY"
        ])
      ];

      const dailyCandlesBySymbol =
        new Map<string, Candle[]>();

      const intradayCandlesBySymbol =
        new Map<string, Candle[]>();

      for (const symbol of symbols) {
        dailyCandlesBySymbol.set(
          symbol,
          await this.loadCandles(
            loader,
            symbol,
            "1d",
            dailyStart,
            end
          )
        );

        const intraday =
          await this.loadCandles(
            loader,
            symbol,
            "5m",
            intradayStart,
            intradayEnd
          );

        if (intraday.length > 0) {
          intradayCandlesBySymbol.set(
            symbol,
            intraday
          );
        }
      }

      const availableCandidates =
        candidates.filter((candidate) =>
          (dailyCandlesBySymbol.get(
            candidate.symbol
          )?.length ?? 0) > 0
        );

      return {
        dailyCandlesBySymbol,
        intradayCandlesBySymbol,
        availableCandidates
      };
    } finally {
      repository.close();
    }
  }

  private async loadCandles(
    loader: BacktestDataLoader,
    symbol: string,
    timeframe: Timeframe,
    rangeStart: Date,
    rangeEnd: Date
  ): Promise<Candle[]> {
    let candles = await loader.load({
      symbol,
      timeframe,
      start: rangeStart,
      end: rangeEnd
    });

    if (
      candles.length === 0 &&
      timeframe === "1d"
    ) {
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

function serializeTrades(
  trades: Trade[]
): DashboardTrade[] {
  return trades.map((trade) => ({
    id: trade.id,
    date: dayKey(trade.timestamp),
    side: trade.side,
    symbol: trade.symbol,
    quantity: trade.quantity,
    price: trade.price,
    commission: trade.commission,
    reason: trade.reason,
    reasonLabel: formatTradeReason(
      trade.reason
    ),
    ...(trade.detail
      ? { detail: trade.detail }
      : {})
  }));
}

function activeSymbolOnDay(
  day: string,
  selections: Array<{
    date: string;
    symbols: string[];
  }>
): string {
  let symbol = "(flat)";

  for (const selection of selections) {
    if (selection.date > day) {
      break;
    }

    symbol =
      selection.symbols[0] ?? "(flat)";
  }

  return symbol;
}
