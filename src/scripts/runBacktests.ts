import "dotenv/config";

import {
  SQLiteCandleRepository
} from "../data/SQLiteCandleRepository.js";

import {
  BacktestDataLoader
} from "../backtest/BacktestDataLoader.js";

import {
  BacktestEngine
} from "../backtest/BacktestEngine.js";

import type {
  EquityPoint
} from "../backtest/BacktestEngine.js";

import {
  PortfolioSimulator
} from "../backtest/PortfolioSimulator.js";

import {
  MovingAverageCrossoverStrategy
} from "../strategy/MovingAverageCrossoverStrategy.js";

import type { Candle } from "../types/market.js";

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

const repository =
  new SQLiteCandleRepository(
    databasePath
  );

const initialCash = 10_000;

interface StrategyConfiguration {
  name: string;
  rsiPeriod?: number;
rsiThreshold?: number;  trendPeriod?: number;
}

interface StrategyDiagnostics {
  bullishCrossovers: number;
  bullishTrendEntries: number;
  rsiRejectedEntries: number;
  trendRejectedEntries: number;
  successfulEntries: number;
  bearishExits: number;
}

interface StrategyTestResult {
  configuration: StrategyConfiguration;

  fastPeriod: number;
  slowPeriod: number;

  returnPercent: number;
  maxDrawdown: number;
  trades: number;
  finalEquity: number;
  exposurePercent: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWinningTrade: number;
  averageLosingTrade: number;
  profitFactor: number;

  averageWeeklyReturn: number;
medianWeeklyReturn: number;
compoundedReturn: number;
bestWeeklyReturn: number;
worstWeeklyReturn: number;
positiveWeeks: number;
totalWeeks: number;
weeklyWinRate: number;

  diagnostics: StrategyDiagnostics;
}

interface WalkForwardWindow {
  trainingStart: string;
  trainingEnd: string;
  validationStart: string;
  validationEnd: string;
}

interface WalkForwardResult {
  trainingStart: string;
  trainingEnd: string;
  validationStart: string;
  validationEnd: string;

  configuration: string;

  fastPeriod: number;
  slowPeriod: number;

  strategyReturn: number;
  benchmarkReturn: number;

  strategyDrawdown: number;
  benchmarkDrawdown: number;

  difference: number;
  trades: number;
  strategyExposure: number;

  averageWeeklyReturn: number;
medianWeeklyReturn: number;
compoundedReturn: number;
bestWeeklyReturn: number;
worstWeeklyReturn: number;
positiveWeeks: number;
totalWeeks: number;
weeklyWinRate: number;
}

const strategyConfigurations: StrategyConfiguration[] = [
  {
    name: "Baseline"
  },
  {
    name: "RSI 14/55",
    rsiPeriod: 14,
    rsiThreshold: 55
  },
  {
    name: "RSI 14/60",
    rsiPeriod: 14,
    rsiThreshold: 60
  },
  {
    name: "RSI 14/65",
    rsiPeriod: 14,
    rsiThreshold: 65
  },
  {
    name: "RSI 14/55 + Trend 100",
    rsiPeriod: 14,
    rsiThreshold: 55,
    trendPeriod: 100
  },
  {
    name: "RSI 14/60 + Trend 100",
    rsiPeriod: 14,
    rsiThreshold: 60,
    trendPeriod: 100
  },
  {
    name: "RSI 14/65 + Trend 100",
    rsiPeriod: 14,
    rsiThreshold: 65,
    trendPeriod: 100
  }
];

const parameterSets: [number, number][] = [
  [3, 5],
  [3, 8],
  [3, 10],
  [5, 10],
  [5, 15],
  [5, 20],
  [5, 30],
  [5, 50],

  [8, 15],
  [8, 20],
  [8, 30],
  [8, 50],

  [10, 20],
  [10, 30],
  [10, 50],
  [10, 75],

  [15, 30],
  [15, 50],
  [15, 75],
  [15, 100],

  [20, 50],
  [20, 75],
  [20, 100],
  [20, 150],

  [30, 50],
  [30, 75],
  [30, 100],
  [30, 150],

  [50, 100],
  [50, 150],
  [50, 200],

  [75, 150],
  [75, 200],

  [100, 200],
  [100, 300]
];

function calculateBuyAndHold(
  candles: Candle[],
  initialCash: number
) {
  const firstCandle =
    candles[0];

  if (!firstCandle) {
    throw new Error(
      "Unable to calculate buy-and-hold benchmark."
    );
  }

  const shares =
    Math.floor(
      initialCash /
      firstCandle.close
    );

  const cashRemaining =
    initialCash -
    shares * firstCandle.close;

  let peakEquity =
    initialCash;

  let maxDrawdown =
    0;

  for (const candle of candles) {
    const equity =
      cashRemaining +
      shares * candle.close;

    if (equity > peakEquity) {
      peakEquity = equity;
    }

    const drawdown =
      peakEquity > 0
        ? (
            (peakEquity - equity) /
            peakEquity
          ) * 100
        : 0;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const lastCandle =
    candles[candles.length - 1];

  if (!lastCandle) {
    throw new Error(
      "Unable to determine final candle."
    );
  }

  const finalValue =
    cashRemaining +
    shares * lastCandle.close;

  const pnl =
    finalValue -
    initialCash;

  const returnPercent =
    (pnl / initialCash) * 100;

  return {
    shares,
    entryPrice:
      firstCandle.close,
    exitPrice:
      lastCandle.close,
    finalValue,
    pnl,
    returnPercent,
    maxDrawdown
  };
}

function calculateWeeklyReturns(
  equityCurve: EquityPoint[]
) {
  if (equityCurve.length === 0) {
    return {
  averageWeeklyReturn: 0,
  medianWeeklyReturn: 0,
  compoundedReturn: 0,
  bestWeeklyReturn: 0,
  worstWeeklyReturn: 0,
  positiveWeeks: 0,
  totalWeeks: 0,
  weeklyWinRate: 0
};
  }

  const weeklyEquity = new Map<string, number>();

  for (const point of equityCurve) {
    const date = new Date(point.timestamp);

    const day = date.getUTCDay();

    const daysFromMonday =
      day === 0 ? 6 : day - 1;

    const weekStart = new Date(date);

    weekStart.setUTCDate(
      date.getUTCDate() - daysFromMonday
    );

    weekStart.setUTCHours(
      0,
      0,
      0,
      0
    );

    const key =
      weekStart.toISOString().slice(0, 10);

    /*
     * Keep the final equity value recorded
     * for each week.
     */
    weeklyEquity.set(
      key,
      point.equity
    );
  }

  const weeks =
    Array.from(
      weeklyEquity.entries()
    ).sort(
      ([a], [b]) =>
        a.localeCompare(b)
    );

  if (weeks.length < 2) {
    return {
      averageWeeklyReturn: 0,
      medianWeeklyReturn: 0,
      compoundedReturn: 0,
      bestWeeklyReturn: 0,
      worstWeeklyReturn: 0,
      positiveWeeks: 0,
      totalWeeks: 0,
      weeklyWinRate: 0
    };
  }

  const weeklyReturns: number[] = [];

  for (
    let i = 1;
    i < weeks.length;
    i++
  ) {
    const previousEquity =
      weeks[i - 1]?.[1];

    const currentEquity =
      weeks[i]?.[1];

    if (
      previousEquity === undefined ||
      currentEquity === undefined ||
      previousEquity <= 0
    ) {
      continue;
    }

    const weeklyReturn =
      (
        (currentEquity -
          previousEquity) /
        previousEquity
      ) * 100;

    weeklyReturns.push(
      weeklyReturn
    );
  }

  if (weeklyReturns.length === 0) {
    return {
      averageWeeklyReturn: 0,
      medianWeeklyReturn: 0,
      compoundedReturn: 0,
      bestWeeklyReturn: 0,
      worstWeeklyReturn: 0,
      positiveWeeks: 0,
      totalWeeks: 0,
      weeklyWinRate: 0
    };
  }

  const averageWeeklyReturn =
    weeklyReturns.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    weeklyReturns.length;

  const growthFactor =
    weeklyReturns.reduce(
      (factor, weeklyReturn) =>
        factor *
        (1 + weeklyReturn / 100),
      1
    );

  const compoundedReturn =
    (growthFactor - 1) * 100;

  const bestWeeklyReturn =
    Math.max(
      ...weeklyReturns
    );

  const worstWeeklyReturn =
    Math.min(
      ...weeklyReturns
    );

const sortedWeeklyReturns =
  [...weeklyReturns].sort(
    (a, b) => a - b
  );

const middle =
  Math.floor(
    sortedWeeklyReturns.length / 2
  );

const medianWeeklyReturn =
  sortedWeeklyReturns.length % 2 === 0
    ? (
        sortedWeeklyReturns[middle - 1]! +
        sortedWeeklyReturns[middle]!
      ) / 2
    : sortedWeeklyReturns[middle]!;

const positiveWeeks =
  weeklyReturns.filter(
    (value) =>
      value > 0
  ).length;

const totalWeeks =
  weeklyReturns.length;

const weeklyWinRate =
  (
    positiveWeeks /
    totalWeeks
  ) * 100;

return {
  averageWeeklyReturn,
  medianWeeklyReturn,
  compoundedReturn,
  bestWeeklyReturn,
  worstWeeklyReturn,
  positiveWeeks,
  totalWeeks,
  weeklyWinRate
};
}

function runStrategyTest(
  candles: Candle[],
  fastPeriod: number,
  slowPeriod: number,
  initialCash: number,
  configuration: StrategyConfiguration
): StrategyTestResult {
  
  const strategy =
  new MovingAverageCrossoverStrategy({

    fastPeriod,
    slowPeriod,

    ...(configuration.rsiPeriod !== undefined
      ? {
          rsiPeriod:
            configuration.rsiPeriod
        }
      : {}),

    ...(configuration.rsiThreshold !== undefined
      ? {
          rsiThreshold:
            configuration.rsiThreshold
        }
      : {}),

    ...(configuration.trendPeriod !== undefined
      ? {
          trendPeriod:
            configuration.trendPeriod
        }
      : {})
  });


  const portfolio =
    new PortfolioSimulator({
      initialCash,
      commissionPerTrade: 1,
      slippagePercent: 0.05
    });

  const engine =
    new BacktestEngine(
      portfolio
    );

  const result =
  engine.run(
    candles,
    strategy
  );

const diagnostics =
  strategy.getDiagnostics();

const weeklyMetrics =
  calculateWeeklyReturns(
    result.equityCurve
  );

const returnPercent =
  (
    (result.finalEquity - initialCash) /
    initialCash
  ) * 100;

return {
  configuration,
  fastPeriod,
  slowPeriod,

  returnPercent,
  maxDrawdown: result.maxDrawdown,
  trades: result.trades,
  finalEquity: result.finalEquity,
  exposurePercent: result.exposurePercent,

  winningTrades:
    result.winningTrades,

  losingTrades:
    result.losingTrades,

  winRate:
    result.winRate,

  averageWinningTrade:
    result.averageWinningTrade,

  averageLosingTrade:
    result.averageLosingTrade,

  profitFactor:
    result.profitFactor,

  averageWeeklyReturn:
  weeklyMetrics.averageWeeklyReturn,

medianWeeklyReturn:
  weeklyMetrics.medianWeeklyReturn,

compoundedReturn:
  weeklyMetrics.compoundedReturn,

bestWeeklyReturn:
  weeklyMetrics.bestWeeklyReturn,

  worstWeeklyReturn:
    weeklyMetrics.worstWeeklyReturn,

  positiveWeeks:
    weeklyMetrics.positiveWeeks,

  totalWeeks:
    weeklyMetrics.totalWeeks,

  weeklyWinRate:
    weeklyMetrics.weeklyWinRate,

  diagnostics
};
}

/*
 * Evaluate every strategy configuration
 * against every moving-average parameter set.
 *
 * 4 configurations × 10 parameter sets = 40 candidates.
 */

function calculateCompoundedReturn(
  weeklyReturns: number[]
): number {
  if (weeklyReturns.length === 0) {
    return 0;
  }

  const growthFactor = weeklyReturns.reduce(
    (factor, weeklyReturn) =>
      factor * (1 + weeklyReturn / 100),
    1
  );

  return (growthFactor - 1) * 100;
}

function selectBestParameters(
  candles: Candle[],
  initialCash: number
): StrategyTestResult {
  const results: StrategyTestResult[] = [];

  /*
   * =========================================================
   * WEEKLY-RETURN OPTIMIZATION
   * =========================================================
   *
   * Primary objective:
   *   Maximize average weekly return.
   *
   * Secondary objectives:
   *   - More positive weeks
   *   - Higher best week
   *
   * Penalties:
   *   - Large losing weeks
   *   - Excessive overall drawdown
   *
   * This is intentionally different from the previous
   * optimizer, which primarily optimized total return.
   */

  /*
   * Maximum acceptable overall drawdown.
   *
   * 15% is intentionally more aggressive than the previous
   * B&H-relative constraint.
   */
  const maximumDrawdown = 10;

  /*
   * Test every strategy configuration against every
   * moving-average combination.
   */
  for (
    const configuration
    of strategyConfigurations
  ) {
    for (
      const [fastPeriod, slowPeriod]
      of parameterSets
    ) {
      results.push(
        runStrategyTest(
          candles,
          fastPeriod,
          slowPeriod,
          initialCash,
          configuration
        )
      );
    }
  }
  

  /*
   * Reject strategies whose total drawdown is beyond
   * our maximum risk tolerance.
   */
 const minimumTrades = 15;


const acceptable =
  results.filter(
    (result) =>
      result.averageWeeklyReturn > 0 &&
      result.maxDrawdown <= maximumDrawdown &&
      result.trades >= minimumTrades
  );

  console.log("");

console.log("=== Parameter Scores ===");

const score =
  (result: StrategyTestResult) => {

    const averageWeeklyComponent =
      result.averageWeeklyReturn * 30;

    const medianWeeklyComponent =
      result.medianWeeklyReturn * 20;

    const weeklyWinRateComponent =
      result.weeklyWinRate * 0.25;

    const bestWeekComponent =
      Math.max(
        result.bestWeeklyReturn,
        0
      ) * 1;

    const worstWeekPenalty =
      Math.abs(
        Math.min(
          result.worstWeeklyReturn,
          0
        )
      ) * 6;

    const drawdownPenalty =
      Math.max(
        result.maxDrawdown - 5,
        0
      ) * 3;

    const tradeConfidenceBonus =
      Math.min(
        result.trades / 50,
        1
      ) * 2;

    return (
      averageWeeklyComponent +
      medianWeeklyComponent +
      weeklyWinRateComponent +
      bestWeekComponent +
      tradeConfidenceBonus -
      worstWeekPenalty -
      drawdownPenalty
    );
  };

  console.log("");

for (const result of results) {
  console.log(
    `${result.configuration.name.padEnd(20)} ` +
    `${result.fastPeriod}/${result.slowPeriod}` +
    ` | Avg: ${result.averageWeeklyReturn.toFixed(2)}%` +
    ` | Win: ${result.weeklyWinRate.toFixed(1)}%` +
    ` | Worst: ${result.worstWeeklyReturn.toFixed(2)}%` +
    ` | DD: ${result.maxDrawdown.toFixed(2)}%` +
    ` | Trades: ${result.trades}` +
    ` | Score: ${score(result).toFixed(2)}`
  );
}

  /*
   * If nothing survives the drawdown constraint,
   * fall back to all candidates.
   */
  const candidates =
    acceptable.length > 0
      ? acceptable
      : results;

  /*
 * =========================================================
 * WEEKLY SCORE
 * =========================================================
 *
 * Average weekly return is the primary metric.
 *
 * Positive-week rate rewards consistency.
 *
 * Worst weekly return is penalized so the optimizer
 * does not simply select highly volatile strategies.
 *
 * Drawdown receives a penalty after 5% because we want
 * aggressive returns while still controlling downside.
 */

  

  /*
   * Rank candidates by weekly-return score.
   */
  candidates.sort(
    (a, b) =>
      score(b) -
      score(a)
  );

  const selected =
    candidates[0];

  if (!selected) {
    throw new Error(
      "Unable to select strategy parameters."
    );
  }

  console.log(
  `Bullish Crossovers: ${selected.diagnostics.bullishCrossovers}`
);

console.log(
  `RSI Rejections:     ${selected.diagnostics.rsiRejectedEntries}`
);

console.log(
  `Trend Rejections:   ${selected.diagnostics.trendRejectedEntries}`
);

console.log(
  `Successful Entries: ${selected.diagnostics.successfulEntries}`
);

console.log(
  `Bearish Exits:      ${selected.diagnostics.bearishExits}`
);

  /*
   * Display the optimization score so we can
   * inspect why a configuration was selected.
   */
  console.log("");
  console.log(
    "=== Weekly Optimization ==="
  );

  console.log(
    `Selected:            ${selected.configuration.name}`
  );

  console.log(
    `Parameters:          ${selected.fastPeriod}/${selected.slowPeriod}`
  );

  console.log(
    `Avg Weekly Return:   ${selected.averageWeeklyReturn.toFixed(2)}%`
  );

console.log(
  `Compounded Return:   ${selected.compoundedReturn.toFixed(2)}%`
);

  console.log(
    `Best Weekly Return:  ${selected.bestWeeklyReturn.toFixed(2)}%`
  );

  console.log(
    `Worst Weekly Return: ${selected.worstWeeklyReturn.toFixed(2)}%`
  );

  console.log(
    `Weekly Win Rate:     ${selected.weeklyWinRate.toFixed(1)}%`
  );

  console.log(
    `Max Drawdown:        ${selected.maxDrawdown.toFixed(2)}%`
  );

  console.log(
    `Optimization Score:  ${score(selected).toFixed(2)}`
  );

  return selected;
}

function runWalkForwardWindow(
  loader: BacktestDataLoader,
  window: WalkForwardWindow
): Promise<WalkForwardResult> {
  return (async () => {
    const trainingCandles =
      await loader.load({
        symbol: "QQQ",
        timeframe: "5m",
        start: new Date(
          window.trainingStart
        ),
        end: new Date(
          window.trainingEnd
        )
      });

    const validationCandles =
      await loader.load({
        symbol: "QQQ",
        timeframe: "5m",
        start: new Date(
          window.validationStart
        ),
        end: new Date(
          window.validationEnd
        )
      });

    if (
      trainingCandles.length === 0 ||
      validationCandles.length === 0
    ) {
      throw new Error(
        `Insufficient candles for walk-forward window: ${window.validationStart}`
      );
    }

    /*
     * Select BOTH:
     *
     * - strategy configuration
     * - moving-average parameters
     *
     * using training data only.
     */
    const selected =
      selectBestParameters(
        trainingCandles,
        initialCash
      );

    /*
     * Run the selected configuration
     * and parameters against unseen data.
     */
    const validation =
      runStrategyTest(
        validationCandles,
        selected.fastPeriod,
        selected.slowPeriod,
        initialCash,
        selected.configuration
      );

    const benchmark =
      calculateBuyAndHold(
        validationCandles,
        initialCash
      );

    return {
  trainingStart:
    window.trainingStart,

  trainingEnd:
    window.trainingEnd,

  validationStart:
    window.validationStart,

  validationEnd:
    window.validationEnd,

  configuration:
    selected.configuration.name,

  fastPeriod:
    selected.fastPeriod,

  slowPeriod:
    selected.slowPeriod,

  strategyReturn:
    validation.returnPercent,

  benchmarkReturn:
    benchmark.returnPercent,

  strategyDrawdown:
    validation.maxDrawdown,

  benchmarkDrawdown:
    benchmark.maxDrawdown,

  difference:
    validation.returnPercent -
    benchmark.returnPercent,

  trades:
    validation.trades,

  strategyExposure:
    validation.exposurePercent,

  averageWeeklyReturn:
  validation.averageWeeklyReturn,

medianWeeklyReturn:
  validation.medianWeeklyReturn,

compoundedReturn:
  validation.compoundedReturn,

  bestWeeklyReturn:
    validation.bestWeeklyReturn,

  worstWeeklyReturn:
    validation.worstWeeklyReturn,

  positiveWeeks:
    validation.positiveWeeks,

  totalWeeks:
    validation.totalWeeks,

  weeklyWinRate:
    validation.weeklyWinRate
};
  })();
}

try {
  const loader =
    new BacktestDataLoader(
      repository
    );

  /*
   * =========================================================
   * ORIGINAL TRAINING / VALIDATION TEST
   * =========================================================
   *
   * This now also selects from all 40 candidates.
   */

  const trainingStart =
    new Date(
      "2026-01-01T00:00:00Z"
    );

  const trainingEnd =
    new Date(
      "2026-05-31T23:59:59Z"
    );

  const validationStart =
    new Date(
      "2026-06-01T00:00:00Z"
    );

  const validationEnd =
    new Date(
      "2026-08-08T23:59:59Z"
    );

  const trainingCandles =
    await loader.load({
      symbol: "QQQ",
      timeframe: "5m",
      start: trainingStart,
      end: trainingEnd
    });

  const validationCandles =
    await loader.load({
      symbol: "QQQ",
      timeframe: "5m",
      start: validationStart,
      end: validationEnd
    });

  if (
    trainingCandles.length === 0
  ) {
    throw new Error(
      "No training candles found for QQQ."
    );
  }

  if (
    validationCandles.length === 0
  ) {
    throw new Error(
      "No validation candles found for QQQ."
    );
  }

  const selected =
    selectBestParameters(
      trainingCandles,
      initialCash
    );

  const validationResult =
    runStrategyTest(
      validationCandles,
      selected.fastPeriod,
      selected.slowPeriod,
      initialCash,
      selected.configuration
    );

  const validationBenchmark =
    calculateBuyAndHold(
      validationCandles,
      initialCash
    );

  console.log("");

  console.log(
    "=== Training / Validation Test ==="
  );

  console.log(
    `Configuration:     ${selected.configuration.name}`
  );

  console.log(
    `Training candles:   ${trainingCandles.length}`
  );

  console.log(
    `Validation candles: ${validationCandles.length}`
  );

  console.log("");

  console.log(
    "Selected Parameters:"
  );

  console.log(
    `Fast:               ${selected.fastPeriod}`
  );

  console.log(
    `Slow:               ${selected.slowPeriod}`
  );

  console.log("");

  console.log(
    `Training Return:    ${selected.returnPercent.toFixed(2)}%`
  );

  console.log(
    `Training Drawdown:  ${selected.maxDrawdown.toFixed(2)}%`
  );

  console.log("");

  console.log(
    `Validation Return:  ${validationResult.returnPercent.toFixed(2)}%`
  );

  console.log(
    `Validation Drawdown:${validationResult.maxDrawdown.toFixed(2)}%`
  );

  console.log(
    `B&H Return:         ${validationBenchmark.returnPercent.toFixed(2)}%`
  );

  console.log(
    `B&H Drawdown:       ${validationBenchmark.maxDrawdown.toFixed(2)}%`
  );

  console.log(
    `Difference:         ${(
      validationResult.returnPercent -
      validationBenchmark.returnPercent
    ).toFixed(2)}%`
  );

  /*
   * =========================================================
   * FILTER COMPARISON
   * =========================================================
   *
   * Hold MA parameters fixed at 50/100.
   * This isolates the effect of the filters.
   */

  const comparisonFastPeriod =
    50;

  const comparisonSlowPeriod =
    100;

  console.log("");

  console.log(
    "=== Filter Comparison: 50/100 ==="
  );

  console.log(
    "Configuration     Return     Drawdown   Trades   B&H Diff"
  );

  console.log(
    "---------------------------------------------------------"
  );

  const filterResults =
    strategyConfigurations.map(
      (configuration) => {
        const result =
          runStrategyTest(
            validationCandles,
            comparisonFastPeriod,
            comparisonSlowPeriod,
            initialCash,
            configuration
          );

        return {
          configuration,
          result
        };
      }
    );

  for (
    const item of filterResults
  ) {
    console.log(
      `${item.configuration.name.padEnd(17)} ` +
      `${item.result.returnPercent
        .toFixed(2)
        .padStart(7)}%  ` +
      `${item.result.maxDrawdown
        .toFixed(2)
        .padStart(8)}%  ` +
      `${String(item.result.trades)
        .padStart(6)}  ` +
      `${(
        item.result.returnPercent -
        validationBenchmark.returnPercent
      )
        .toFixed(2)
        .padStart(7)}%`
    );
  }

  /*
   * =========================================================
   * WALK-FORWARD TEST
   * =========================================================
   *
   * Three months training
   * followed by one month validation.
   */

function generateWalkForwardWindows(
  startDate: string,
  endDate: string
): WalkForwardWindow[] {
  const windows: WalkForwardWindow[] = [];

  const dataStart = new Date(startDate);
  const dataEnd = new Date(endDate);

  const validationStart = new Date(dataStart);

  // Start validation after 3 months of training data.
  validationStart.setUTCMonth(
    validationStart.getUTCMonth() + 3
  );

  while (validationStart <= dataEnd) {
    const trainingStart =
      new Date(validationStart);

    trainingStart.setUTCMonth(
      trainingStart.getUTCMonth() - 3
    );

    const trainingEnd =
      new Date(validationStart);

    trainingEnd.setUTCDate(
      trainingEnd.getUTCDate() - 1
    );

    trainingEnd.setUTCHours(
      23,
      59,
      59,
      999
    );

    const validationEnd =
      new Date(validationStart);

    validationEnd.setUTCMonth(
      validationEnd.getUTCMonth() + 1
    );

    validationEnd.setUTCDate(0);

    validationEnd.setUTCHours(
      23,
      59,
      59,
      999
    );

    if (validationEnd > dataEnd) {
      validationEnd.setTime(
        dataEnd.getTime()
      );
    }

    windows.push({
      trainingStart:
        trainingStart.toISOString(),

      trainingEnd:
        trainingEnd.toISOString(),

      validationStart:
        validationStart.toISOString(),

      validationEnd:
        validationEnd.toISOString()
    });

    validationStart.setUTCMonth(
      validationStart.getUTCMonth() + 1
    );
  }

  return windows;
}

  const walkForwardWindows =
  generateWalkForwardWindows(
    "2026-01-01T00:00:00Z",
    "2026-08-08T23:59:59Z"
  );

  const walkForwardResults:
    WalkForwardResult[] = [];

  for (
    const window
    of walkForwardWindows
  ) {
    const result =
      await runWalkForwardWindow(
        loader,
        window
      );

    walkForwardResults.push(
      result
    );
  }

  console.log("");

  console.log(
  "=== Walk-Forward Results ==="
);

console.log(
  "Train Window                 Test Window        Configuration    Params   Strategy   B&H       Diff      DD     B&H DD    Trades   Exposure   AvgWeek   BestWeek  WorstWeek  PosWeeks"
);

console.log(
  "-------------------------------------------------------------------------------------------------------------------------------------"
);console.log(
  "-----------------------------------------------------------------------------------------------------------------------------------------------------------"
);

for (
  const result
  of walkForwardResults
) {
  const trainStart =
    result.trainingStart.slice(
      0,
      10
    );

  const trainEnd =
    result.trainingEnd.slice(
      0,
      10
    );

  const testStart =
    result.validationStart.slice(
      0,
      10
    );

  const testEnd =
    result.validationEnd.slice(
      0,
      10
    );

  console.log(
    `${trainStart} → ${trainEnd}  ` +
    `${testStart} → ${testEnd}  ` +
    `${result.configuration.padEnd(16)}` +
    `${`${result.fastPeriod}/${result.slowPeriod}`.padStart(8)}` +
    `  ${result.strategyReturn
      .toFixed(2)
      .padStart(7)}%` +
    `  ${result.benchmarkReturn
      .toFixed(2)
      .padStart(7)}%` +
    `  ${result.difference
      .toFixed(2)
      .padStart(7)}%` +
    `  ${result.strategyDrawdown
      .toFixed(2)
      .padStart(8)}%` +
    `  ${result.benchmarkDrawdown
      .toFixed(2)
      .padStart(8)}%` +
    `  ${String(result.trades)
      .padStart(6)}` +
    `  ${result.strategyExposure
      .toFixed(1)
      .padStart(7)}%` +
          `  ${result.averageWeeklyReturn
      .toFixed(2)
      .padStart(7)}%` +
    `  ${result.bestWeeklyReturn
      .toFixed(2)
      .padStart(8)}%` +
    `  ${result.worstWeeklyReturn
      .toFixed(2)
      .padStart(9)}%` +
    `  ${`${result.positiveWeeks}/${result.totalWeeks}`
      .padStart(8)}`
  );
}

  /*
   * =========================================================
   * WALK-FORWARD SUMMARY
   * =========================================================
   */

  const totalStrategyReturn =
    walkForwardResults.reduce(
      (sum, result) =>
        sum +
        result.strategyReturn,
      0
    );

  const totalBenchmarkReturn =
    walkForwardResults.reduce(
      (sum, result) =>
        sum +
        result.benchmarkReturn,
      0
    );

  const averageStrategyReturn =
    totalStrategyReturn /
    walkForwardResults.length;

  const averageBenchmarkReturn =
    totalBenchmarkReturn /
    walkForwardResults.length;

  const averageDifference =
    walkForwardResults.reduce(
      (sum, result) =>
        sum +
        result.difference,
      0
    ) /
    walkForwardResults.length;

  const strategyWins =
    walkForwardResults.filter(
      (result) =>
        result.difference > 0
    ).length;

  const drawdownWins =
    walkForwardResults.filter(
      (result) =>
        result.strategyDrawdown <
        result.benchmarkDrawdown
    ).length;

  const totalTrades =
    walkForwardResults.reduce(
      (sum, result) =>
        sum +
        result.trades,
      0
    );

    const averageExposure =
  walkForwardResults.reduce(
    (sum, result) =>
      sum +
      result.strategyExposure, 0
    
  ) /
  walkForwardResults.length;

  const averageWeeklyReturn =
  walkForwardResults.reduce(
    (sum, result) =>
      sum +
      result.averageWeeklyReturn,
    0
  ) /

  
  walkForwardResults.length;


const bestWeeklyReturn =
  Math.max(
    ...walkForwardResults.map(
      result =>
        result.bestWeeklyReturn
    )
  );

const worstWeeklyReturn =
  Math.min(
    ...walkForwardResults.map(
      result =>
        result.worstWeeklyReturn
    )
  );

const totalPositiveWeeks =
  walkForwardResults.reduce(
    (sum, result) =>
      sum +
      result.positiveWeeks,
    0
  );

const totalWeeks =
  walkForwardResults.reduce(
    (sum, result) =>
      sum +
      result.totalWeeks,
    0
  );

const weeklyWinRate =
  totalWeeks > 0
    ? (
        totalPositiveWeeks /
        totalWeeks
      ) * 100
    : 0;

  console.log("");

  console.log(
    "=== Walk-Forward Summary ==="
  );

  console.log(
    `Validation Windows:       ${walkForwardResults.length}`
  );

  console.log(
    `Average Strategy Return:  ${averageStrategyReturn.toFixed(2)}%`
  );

  console.log(
    `Average B&H Return:       ${averageBenchmarkReturn.toFixed(2)}%`
  );

  console.log(
    `Average Difference:       ${averageDifference.toFixed(2)}%`
  );

  console.log(
    `Strategy Beat B&H:        ${strategyWins}/${walkForwardResults.length}`
  );

  console.log(
    `Lower Drawdown:           ${drawdownWins}/${walkForwardResults.length}`
  );

  console.log(
    `Total Validation Trades:  ${totalTrades}`
  );

  console.log(
  `Average Strategy Exposure: ${averageExposure.toFixed(1)}%`
);

console.log(
  `Average Weekly Return:    ${averageWeeklyReturn.toFixed(2)}%`
);

console.log(
  `Best Weekly Return:       ${bestWeeklyReturn.toFixed(2)}%`
);

console.log(
  `Worst Weekly Return:      ${worstWeeklyReturn.toFixed(2)}%`
);

console.log(
  `Positive Weeks:           ${totalPositiveWeeks}/${totalWeeks}`
);

console.log(
  `Weekly Win Rate:          ${weeklyWinRate.toFixed(1)}%`
);

  console.log("");

const minimumValidationWindows = 5;

if (
  walkForwardResults.length <
  minimumValidationWindows
) {
  console.log(
    `Walk-forward assessment: insufficient validation data. ` +
    `Need at least ${minimumValidationWindows} validation windows.`
  );
} else if (
  strategyWins >=
  Math.ceil(
    walkForwardResults.length / 2
  ) &&
  drawdownWins >=
  Math.ceil(
    walkForwardResults.length / 2
  )
) {
  console.log(
    "Walk-forward assessment: strategy shows evidence of out-of-sample robustness."
  );
} else if (
  drawdownWins >=
  Math.ceil(
    walkForwardResults.length / 2
  )
) {
  console.log(
    "Walk-forward assessment: strategy consistently reduces drawdown, but does not consistently outperform buy-and-hold."
  );
} else {
  console.log(
    "Walk-forward assessment: insufficient evidence of robustness."
  );
}
} finally {
  repository.close();
}

