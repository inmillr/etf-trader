import "dotenv/config";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { MultiSymbolBacktestEngine } from "../backtest/MultiSymbolBacktestEngine.js";
import { MultiSymbolHybridBacktestEngine } from "../backtest/MultiSymbolHybridBacktestEngine.js";
import { calculatePeriodReturnMetrics } from "../backtest/ReturnMetrics.js";
import { DEFAULT_PORTFOLIO } from "../config/PortfolioConfig.js";
import {
  HYBRID_TREND_GATE,
  HYBRID_WARMUP_DAYS,
  TUNED_UNIVERSE_FILTER,
  DEFAULT_MOMENTUM_FALLBACK_SYMBOL
} from "../config/StrategyConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import { aggregateToDailyCandles } from "../market/DailyCandleAggregator.js";
import { HoldStrategy } from "../strategy/HoldStrategy.js";
import {
  IntradayMomentumStrategy,
  HYBRID_INTRADAY_OPTIONS
} from "../strategy/IntradayMomentumStrategy.js";
import type { Candle, Timeframe } from "../types/market.js";
import type { EtfCandidate } from "../universe/EtfRank.js";
import { selectDualMomentumAtDate } from "../universe/DualMomentumSelector.js";
import {
  LIQUID_ETF_UNIVERSE,
  StaticUniverseProvider
} from "../universe/EtfUniverse.js";
import { selectTopEtfsAtDate } from "../universe/PointInTimeSelector.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";

const startString = process.argv[2] ?? "2026-01-01";
const endString = process.argv[3] ?? "2026-08-08";

const start = new Date(startString);
const end = new Date(endString);

const noRotation = {
  minHoldDays: 0,
  minScoreImprovement: 0
};

interface Variant {
  name: string;
  kind: "daily-momentum" | "daily-score" | "daily-hybrid";
  candidates: EtfCandidate[];
  lookbackDays: number;
  spyFallback: boolean;
}

const fullCandidates =
  await new StaticUniverseProvider().getCandidates();

const variants: Variant[] = [
  {
    name: "daily-mom-5d-liquid-spy",
    kind: "daily-momentum",
    candidates: LIQUID_ETF_UNIVERSE,
    lookbackDays: 5,
    spyFallback: true
  },
  {
    name: "daily-mom-10d-liquid-spy",
    kind: "daily-momentum",
    candidates: LIQUID_ETF_UNIVERSE,
    lookbackDays: 10,
    spyFallback: true
  },
  {
    name: "daily-mom-10d-liquid-cash",
    kind: "daily-momentum",
    candidates: LIQUID_ETF_UNIVERSE,
    lookbackDays: 10,
    spyFallback: false
  },
  {
    name: "daily-mom-20d-liquid-spy",
    kind: "daily-momentum",
    candidates: LIQUID_ETF_UNIVERSE,
    lookbackDays: 20,
    spyFallback: true
  },
  {
    name: "daily-score-10d-liquid",
    kind: "daily-score",
    candidates: LIQUID_ETF_UNIVERSE,
    lookbackDays: 10,
    spyFallback: false
  },
  {
    name: "daily-score-5d-liquid",
    kind: "daily-score",
    candidates: LIQUID_ETF_UNIVERSE,
    lookbackDays: 5,
    spyFallback: false
  },
  {
    name: "daily-hybrid-liquid",
    kind: "daily-hybrid",
    candidates: LIQUID_ETF_UNIVERSE,
    lookbackDays: 10,
    spyFallback: false
  },
  {
    name: "daily-mom-10d-full-spy",
    kind: "daily-momentum",
    candidates: fullCandidates,
    lookbackDays: 10,
    spyFallback: true
  }
];

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

const repository =
  new SQLiteCandleRepository(
    databasePath
  );

async function loadCandles(
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

try {
  const loader = new BacktestDataLoader(
    repository
  );

  const maxLookback = 30;
  const dataStart = new Date(start);
  dataStart.setUTCDate(
    dataStart.getUTCDate() -
      maxLookback -
      HYBRID_WARMUP_DAYS
  );

  const allSymbols = [
    ...new Set([
      ...fullCandidates.map(
        (c) => c.symbol
      ),
      "SPY"
    ])
  ];

  console.log(
    `Aggressive sweep ${startString} → ${endString}\n`
  );

  const dailyCandlesBySymbol =
    new Map<string, Candle[]>();

  const intradayCandlesBySymbol =
    new Map<string, Candle[]>();

  for (const symbol of allSymbols) {
    dailyCandlesBySymbol.set(
      symbol,
      await loadCandles(
        loader,
        symbol,
        "1d",
        dataStart,
        end
      )
    );

    const intraday = await loadCandles(
      loader,
      symbol,
      "5m",
      start,
      end
    );

    if (intraday.length > 0) {
      intradayCandlesBySymbol.set(
        symbol,
        intraday
      );
    }
  }

  const spyDaily =
    (dailyCandlesBySymbol.get("SPY") ?? [])
      .filter(
        (c) =>
          c.timestamp >= start &&
          c.timestamp <= end
      );

  const spyMetrics =
    calculatePeriodReturnMetrics(
      spyDaily.map((candle) => ({
        timestamp: candle.timestamp,
        equity:
          1000 *
          (candle.close / (spyDaily[0]?.close ?? 1))
      }))
    );

  const dailyEngine =
    new MultiSymbolBacktestEngine();

  const hybridEngine =
    new MultiSymbolHybridBacktestEngine();

  const rows: Array<{
    name: string;
    returnPercent: number;
    avgDaily: number;
    avgWeekly: number;
    trades: number;
    maxDrawdown: number;
  }> = [];

  for (const variant of variants) {
    const available =
      variant.candidates.filter(
        (c) =>
          (dailyCandlesBySymbol.get(
            c.symbol
          )?.length ?? 0) > 0
      );

    let result;

    if (variant.kind === "daily-hybrid") {
      result = hybridEngine.run(
        available,
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
          selectionLookbackDays:
            variant.lookbackDays,
          rebalanceFrequency: "daily",
          rotation: noRotation,
          portfolio: DEFAULT_PORTFOLIO,
          selector: {
            benchmarkSymbol: "SPY",
            lookbackDays:
              variant.lookbackDays,
            topCount: 1,
            weights: DEFAULT_SCORING_WEIGHTS,
            filter: TUNED_UNIVERSE_FILTER
          },
          trendGate: HYBRID_TREND_GATE
        }
      );
    } else {
      result = dailyEngine.run(
        available,
        dailyCandlesBySymbol,
        () => new HoldStrategy(),
        {
          start,
          end,
          topCount: 1,
          selectionLookbackDays:
            variant.lookbackDays,
          rebalanceFrequency: "daily",
          enterOnSelection: true,
          rotation: noRotation,
          portfolio: DEFAULT_PORTFOLIO,
          selector: {
            benchmarkSymbol: "SPY",
            lookbackDays:
              variant.lookbackDays,
            topCount: 1,
            weights: DEFAULT_SCORING_WEIGHTS,
            filter: TUNED_UNIVERSE_FILTER
          },
          selectAtDate: (
            asOfDate,
            candidatesAtDate,
            candles,
            context
          ) => {
            if (
              variant.kind ===
              "daily-momentum"
            ) {
              const selection =
                selectDualMomentumAtDate(
                  asOfDate,
                  candidatesAtDate,
                  candles,
                  {
                    lookbackDays:
                      variant.lookbackDays,
                    topCount:
                      context.topCount,
                    filter:
                      TUNED_UNIVERSE_FILTER,
                    fallbackSymbol:
                      variant.spyFallback
                        ? DEFAULT_MOMENTUM_FALLBACK_SYMBOL
                        : null
                  }
                );

              return selection;
            }

            return selectTopEtfsAtDate(
              asOfDate,
              candidatesAtDate,
              candles,
              {
                lookbackDays:
                  variant.lookbackDays,
                topCount: context.topCount,
                weights:
                  DEFAULT_SCORING_WEIGHTS,
                filter: TUNED_UNIVERSE_FILTER
              }
            );
          }
        }
      );
    }

    const metrics =
      calculatePeriodReturnMetrics(
        result.equityCurve
      );

    rows.push({
      name: variant.name,
      returnPercent: result.returnPercent,
      avgDaily:
        metrics.averageDailyReturn,
      avgWeekly:
        metrics.averageWeeklyReturn,
      trades: result.trades,
      maxDrawdown: result.maxDrawdown
    });
  }

  rows.sort(
    (a, b) => b.avgWeekly - a.avgWeekly
  );

  console.log(
    `SPY reference: avg daily ${spyMetrics.averageDailyReturn.toFixed(3)}%  avg weekly ${spyMetrics.averageWeeklyReturn.toFixed(2)}%\n`
  );

  console.log(
    "Variant                      Return  AvgDaily AvgWeekly  Trades  MaxDD"
  );
  console.log(
    "──────────────────────────────────────────────────────────────────────"
  );

  for (const row of rows) {
    console.log(
      `${row.name.padEnd(28)} ${row.returnPercent.toFixed(2).padStart(6)}% ${row.avgDaily.toFixed(3).padStart(7)}% ${row.avgWeekly.toFixed(2).padStart(8)}% ${String(row.trades).padStart(6)} ${row.maxDrawdown.toFixed(1).padStart(6)}%`
    );
  }
} finally {
  repository.close();
}
