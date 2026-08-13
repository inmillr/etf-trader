import "dotenv/config";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { MultiSymbolHybridBacktestEngine } from "../backtest/MultiSymbolHybridBacktestEngine.js";
import { calculatePeriodReturnMetrics } from "../backtest/ReturnMetrics.js";
import {
  DEFAULT_INITIAL_CASH,
  DEFAULT_PORTFOLIO
} from "../config/PortfolioConfig.js";
import {
  HYBRID_ROTATION_POLICY,
  HYBRID_SELECTION_LOOKBACK_DAYS,
  HYBRID_TREND_GATE,
  HYBRID_WARMUP_DAYS,
  TUNED_UNIVERSE_FILTER
} from "../config/StrategyConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import {
  IntradayMomentumStrategy,
  HYBRID_INTRADAY_OPTIONS
} from "../strategy/IntradayMomentumStrategy.js";
import type { Candle, Timeframe } from "../types/market.js";
import {
  LIQUID_ETF_UNIVERSE,
  StaticUniverseProvider
} from "../universe/EtfUniverse.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

const startString =
  process.argv[2] ?? "2026-01-01";

const endString =
  process.argv[3] ?? "2026-08-08";

const fastPeriod = Number(
  process.argv[4] ??
    HYBRID_TREND_GATE.fastPeriod
);

const slowPeriod = Number(
  process.argv[5] ??
    HYBRID_TREND_GATE.slowPeriod
);

const initialCash = DEFAULT_INITIAL_CASH;
const selectionLookbackDays =
  HYBRID_SELECTION_LOOKBACK_DAYS;
const warmupDays = HYBRID_WARMUP_DAYS;

const tunedFilter = TUNED_UNIVERSE_FILTER;

const rotationPolicy = HYBRID_ROTATION_POLICY;

const start = new Date(startString);
const end = new Date(endString);

const dataStart = new Date(start);
dataStart.setUTCDate(
  dataStart.getUTCDate() - warmupDays
);

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
  return loader.load({
    symbol,
    timeframe,
    start: rangeStart,
    end: rangeEnd
  });
}

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

  console.log(
    `Loading daily + 5m candles for ${symbols.length} symbols...`
  );

  for (const symbol of symbols) {
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

  const availableCandidates =
    candidates.filter((candidate) =>
      dailyCandlesBySymbol.get(
        candidate.symbol
      )?.length
    );

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
      selectionLookbackDays,
      rebalanceFrequency: "weekly",
      rotation: rotationPolicy,
      portfolio: DEFAULT_PORTFOLIO,
      selector: {
        benchmarkSymbol: "SPY",
        lookbackDays: selectionLookbackDays,
        topCount: 1,
        weights: DEFAULT_SCORING_WEIGHTS,
        filter: tunedFilter
      },
      trendGate: {
        fastPeriod,
        slowPeriod
      }
    }
  );

  const metrics =
    calculatePeriodReturnMetrics(
      result.equityCurve
    );

  const spyDaily =
    (dailyCandlesBySymbol.get("SPY") ?? [])
      .filter(
        (candle) =>
          candle.timestamp >= start &&
          candle.timestamp <= end
      );

  const spyStart = spyDaily[0]?.close ?? 0;
  const spyEnd = spyDaily.at(-1)?.close ?? 0;

  const spyReturn =
    spyStart > 0
      ? ((spyEnd - spyStart) / spyStart) * 100
      : 0;

  console.log("");
  console.log(
    "=== Hybrid Strategy Backtest ==="
  );
  console.log(
    `Period:              ${startString} → ${endString}`
  );
  console.log(
    `Selection:           weekly from daily bars`
  );
  console.log(
    `Regime:              MA ${fastPeriod}/${slowPeriod} daily (hold overnight when bullish)`
  );
  console.log(
    `Entry timing:        5m intraday signals (strict morning window)`
  );
  console.log(
    `Intraday symbols:    ${result.intradaySymbols.length} ETFs`
  );
  console.log(
    `Universe:              SPY, QQQ, IWM, DIA (liquid)`
  );
  console.log(
    `Initial cash:        $${initialCash.toLocaleString()}`
  );
  console.log("");

  console.log("=== Performance ===");
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
    `Trend exits:         ${result.trendExits}`
  );
  console.log(
    `Rotation exits:      ${result.rotationExits}`
  );
  console.log(
    `Stop exits:          ${result.stopExits}`
  );
  console.log(
    `Target exits:        ${result.targetExits}`
  );
  console.log(
    `Rebalances:          ${result.rebalanceCount}`
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
    `Strategy vs SPY:     ${(result.returnPercent - spyReturn).toFixed(2)}%`
  );
  console.log("");

  console.log("=== Recent Selections ===");

  for (const selection of result.selections.slice(-8)) {
    console.log(
      `${selection.date}  ${selection.symbols.join(", ") || "(none)"}`
    );
  }
} finally {
  repository.close();
}
