import "dotenv/config";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { MultiSymbolBacktestEngine } from "../backtest/MultiSymbolBacktestEngine.js";
import { calculatePeriodReturnMetrics } from "../backtest/ReturnMetrics.js";
import {
  DEFAULT_INITIAL_CASH,
  DEFAULT_PORTFOLIO
} from "../config/PortfolioConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import { aggregateToDailyCandles } from "../market/DailyCandleAggregator.js";
import { HoldStrategy } from "../strategy/HoldStrategy.js";
import { MovingAverageCrossoverStrategy } from "../strategy/MovingAverageCrossoverStrategy.js";
import type { Candle } from "../types/market.js";
import { selectDualMomentumAtDate } from "../universe/DualMomentumSelector.js";
import {
  DEFAULT_ETF_UNIVERSE,
  LIQUID_ETF_UNIVERSE,
  StaticUniverseProvider
} from "../universe/EtfUniverse.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

const args = process.argv.slice(2);
const useLegacyMa =
  args.includes("--legacy-ma");
const useFullUniverse =
  args.includes("--full-universe");
const compareLegacy =
  args.includes("--compare");

const positional = args.filter(
  (arg) => !arg.startsWith("--")
);

const startString =
  positional[0] ?? "2026-01-01";

const endString =
  positional[1] ?? "2026-08-08";

const lookbackDays = Number(
  positional[2] ?? 126
);

const topCount = Number(
  positional[3] ?? 1
);

const fastPeriod = Number(
  positional[4] ?? 20
);

const slowPeriod = Number(
  positional[5] ?? 50
);

const initialCash = DEFAULT_INITIAL_CASH;

const tunedFilter = {
  minAvgDailyVolume: 500_000,
  minAvgDailyDollarVolume: 10_000_000,
  minPrice: 10,
  minHistoryDays: 30,
  maxAtrPercent: 5.0
};

const rotationPolicy = {
  minHoldDays: 5,
  minScoreImprovement: 5
};

const start = new Date(startString);
const end = new Date(endString);

if (
  Number.isNaN(start.getTime()) ||
  Number.isNaN(end.getTime())
) {
  console.error(
    "Start and end must be valid dates."
  );

  process.exit(1);
}

const universe = useFullUniverse
  ? DEFAULT_ETF_UNIVERSE
  : LIQUID_ETF_UNIVERSE;

const warmupDays = useLegacyMa
  ? 30 + slowPeriod + 5
  : lookbackDays + 35;

const dataStart = new Date(start);
dataStart.setUTCDate(
  dataStart.getUTCDate() - warmupDays
);

const repository =
  new SQLiteCandleRepository(
    databasePath
  );

async function loadDailyCandles(
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

function countCashRebalances(
  selections: Array<{
    date: string;
    symbols: string[];
  }>
): number {
  return selections.filter(
    (selection) =>
      selection.symbols.length === 0
  ).length;
}

function printResult(
  title: string,
  result: ReturnType<
    MultiSymbolBacktestEngine["run"]
  >,
  spyReturn: number
): void {
  const metrics =
    calculatePeriodReturnMetrics(
      result.equityCurve
    );

  console.log(`=== ${title} ===`);
  console.log(
    `Total return:        ${result.returnPercent.toFixed(2)}%`
  );
  console.log(
    `Final equity:        $${result.finalEquity.toFixed(2)}`
  );
  console.log(
    `Max drawdown:        ${result.maxDrawdown.toFixed(2)}%`
  );
  console.log(
    `Trades:              ${result.trades}`
  );
  console.log(
    `Exposure:            ${result.exposurePercent.toFixed(1)}%`
  );
  console.log(
    `Worst day:           ${metrics.worstDailyReturn.toFixed(2)}%`
  );
  console.log(
    `Weekly win rate:     ${metrics.weeklyWinRate.toFixed(1)}%`
  );
  console.log(
    `Strategy vs SPY:     ${(result.returnPercent - spyReturn).toFixed(2)}%`
  );

  if (!useLegacyMa) {
    console.log(
      `Cash rebalances:     ${countCashRebalances(result.selections)}`
    );
  }

  console.log("");
}

try {
  const loader = new BacktestDataLoader(
    repository
  );

  const provider =
    new StaticUniverseProvider(
      universe
    );

  const candidates =
    await provider.getCandidates();

  const symbols = [
    ...new Set([
      ...candidates.map(
        (candidate) => candidate.symbol
      ),
      "SPY"
    ])
  ];

  const candlesBySymbol =
    new Map<string, Candle[]>();

  console.log(
    `Loading daily candles for ${symbols.length} symbols...`
  );

  for (const symbol of symbols) {
    candlesBySymbol.set(
      symbol,
      await loadDailyCandles(
        loader,
        symbol,
        dataStart,
        end
      )
    );
  }

  const availableCandidates =
    candidates.filter((candidate) =>
      (candlesBySymbol.get(
        candidate.symbol
      )?.length ?? 0) > 0
    );

  const portfolio = DEFAULT_PORTFOLIO;

  const engine =
    new MultiSymbolBacktestEngine();

  const dualMomentumResult = engine.run(
    availableCandidates,
    candlesBySymbol,
    () => new HoldStrategy(),
    {
      start,
      end,
      topCount,
      selectionLookbackDays: lookbackDays,
      rebalanceFrequency: "weekly",
      enterOnSelection: true,
      rotation: rotationPolicy,
      portfolio,
      selector: {
        benchmarkSymbol: "SPY",
        lookbackDays,
        topCount,
        weights: DEFAULT_SCORING_WEIGHTS,
        filter: tunedFilter
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
            filter: tunedFilter
          }
        )
    }
  );

  const spyCandles =
    (candlesBySymbol.get("SPY") ?? [])
      .filter(
        (candle) =>
          candle.timestamp >= start &&
          candle.timestamp <= end
      );

  const spyStart = spyCandles[0]?.close ?? 0;
  const spyEnd = spyCandles.at(-1)?.close ?? 0;

  const spyReturn =
    spyStart > 0
      ? ((spyEnd - spyStart) / spyStart) * 100
      : 0;

  if (compareLegacy || useLegacyMa) {
    const legacyWarmupDays =
      30 + slowPeriod + 5;

    const legacyDataStart = new Date(start);
    legacyDataStart.setUTCDate(
      legacyDataStart.getUTCDate() -
      legacyWarmupDays
    );

    const legacyCandles =
      new Map<string, Candle[]>();

    for (const symbol of symbols) {
      legacyCandles.set(
        symbol,
        await loadDailyCandles(
          loader,
          symbol,
          legacyDataStart,
          end
        )
      );
    }

    const legacyResult = engine.run(
      availableCandidates,
      legacyCandles,
      () =>
        new MovingAverageCrossoverStrategy({
          fastPeriod,
          slowPeriod
        }),
      {
        start,
        end,
        topCount,
        selectionLookbackDays: 30,
        rebalanceFrequency: "weekly",
        enterOnSelection: true,
        rotation: rotationPolicy,
        portfolio,
        selector: {
          benchmarkSymbol: "SPY",
          lookbackDays: 30,
          topCount,
          weights: DEFAULT_SCORING_WEIGHTS,
          filter: tunedFilter
        }
      }
    );

    console.log("");
    console.log(
      compareLegacy
        ? "=== Strategy Comparison ==="
        : "=== Legacy MA Strategy Backtest ==="
    );
    console.log(
      `Period:              ${startString} → ${endString}`
    );
    console.log(
      `Universe:            ${useFullUniverse ? "full (30 ETFs)" : "liquid-only (SPY, QQQ, IWM, DIA)"}`
    );
    console.log(
      `SPY buy-and-hold:    ${spyReturn.toFixed(2)}%`
    );
    console.log("");

    if (!useLegacyMa) {
      printResult(
        `Dual momentum (${lookbackDays}d lookback)`,
        dualMomentumResult,
        spyReturn
      );
    }

    printResult(
      `Legacy (composite score + MA ${fastPeriod}/${slowPeriod})`,
      legacyResult,
      spyReturn
    );

    console.log(
      useLegacyMa
        ? "=== Recent Selections ==="
        : "=== Recent Dual Momentum Selections ==="
    );

    const selections = useLegacyMa
      ? legacyResult.selections
      : dualMomentumResult.selections;

    for (const selection of selections.slice(-8)) {
      console.log(
        `${selection.date}  ${selection.symbols.join(", ") || "(cash)"}`
      );
    }
  } else {
    const metrics =
      calculatePeriodReturnMetrics(
        dualMomentumResult.equityCurve
      );

    console.log("");
    console.log(
      "=== Adaptive ETF Strategy Backtest ==="
    );
    console.log(
      `Period:              ${startString} → ${endString}`
    );
    console.log(
      `Strategy:            Dual momentum (${lookbackDays}d lookback, hold until rebalance)`
    );
    console.log(
      `Rebalance:           weekly, min hold 5d, score +5 to rotate`
    );
    console.log(
      `Universe:            liquid-only (SPY, QQQ, IWM, DIA)`
    );
    console.log(
      `Universe symbols:    ${availableCandidates.length} with data`
    );
    console.log(
      `Initial cash:        $${initialCash.toLocaleString()}`
    );
    console.log("");

    console.log("=== Performance ===");
    console.log(
      `Total return:        ${dualMomentumResult.returnPercent.toFixed(2)}%`
    );
    console.log(
      `Final equity:        $${dualMomentumResult.finalEquity.toFixed(2)}`
    );
    console.log(
      `Max drawdown:        ${dualMomentumResult.maxDrawdown.toFixed(2)}%`
    );
    console.log(
      `Trades:              ${dualMomentumResult.trades}`
    );
    console.log(
      `Exposure:            ${dualMomentumResult.exposurePercent.toFixed(1)}%`
    );
    console.log(
      `Cash rebalances:     ${countCashRebalances(dualMomentumResult.selections)}`
    );
    console.log(
      `Rebalances:          ${dualMomentumResult.rebalanceCount}`
    );
    console.log("");

    console.log("=== Daily Returns ===");
    console.log(
      `Average daily:       ${metrics.averageDailyReturn.toFixed(3)}%`
    );
    console.log(
      `Median daily:        ${metrics.medianDailyReturn.toFixed(3)}%`
    );
    console.log(
      `Best day:            ${metrics.bestDailyReturn.toFixed(2)}%`
    );
    console.log(
      `Worst day:           ${metrics.worstDailyReturn.toFixed(2)}%`
    );
    console.log(
      `Positive days:       ${metrics.positiveDays}/${metrics.totalDays}`
    );
    console.log(
      `Daily win rate:      ${metrics.dailyWinRate.toFixed(1)}%`
    );
    console.log("");

    console.log("=== Weekly Returns ===");
    console.log(
      `Average weekly:      ${metrics.averageWeeklyReturn.toFixed(2)}%`
    );
    console.log(
      `Median weekly:       ${metrics.medianWeeklyReturn.toFixed(2)}%`
    );
    console.log(
      `Compounded weekly:   ${metrics.compoundedReturn.toFixed(2)}%`
    );
    console.log(
      `Best week:           ${metrics.bestWeeklyReturn.toFixed(2)}%`
    );
    console.log(
      `Worst week:          ${metrics.worstWeeklyReturn.toFixed(2)}%`
    );
    console.log(
      `Positive weeks:      ${metrics.positiveWeeks}/${metrics.totalWeeks}`
    );
    console.log(
      `Weekly win rate:     ${metrics.weeklyWinRate.toFixed(1)}%`
    );
    console.log("");

    console.log("=== Benchmark (SPY buy-and-hold) ===");
    console.log(
      `SPY return:          ${spyReturn.toFixed(2)}%`
    );
    console.log(
      `Strategy vs SPY:     ${(dualMomentumResult.returnPercent - spyReturn).toFixed(2)}%`
    );
    console.log("");

    console.log("=== Recent Selections ===");

    for (const selection of dualMomentumResult.selections.slice(-8)) {
      console.log(
        `${selection.date}  ${selection.symbols.join(", ") || "(cash)"}`
      );
    }
  }
} finally {
  repository.close();
}
