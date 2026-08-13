import "dotenv/config";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { MultiSymbolBacktestEngine } from "../backtest/MultiSymbolBacktestEngine.js";
import { calculatePeriodReturnMetrics } from "../backtest/ReturnMetrics.js";
import {
  DEFAULT_INITIAL_CASH,
  DEFAULT_PORTFOLIO
} from "../config/PortfolioConfig.js";
import {
  AGGRESSIVE_LOOKBACK_DAYS,
  AGGRESSIVE_ROTATION_POLICY,
  AGGRESSIVE_WARMUP_DAYS,
  TUNED_UNIVERSE_FILTER
} from "../config/StrategyConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import { aggregateToDailyCandles } from "../market/DailyCandleAggregator.js";
import { HoldStrategy } from "../strategy/HoldStrategy.js";
import type { Candle, Timeframe } from "../types/market.js";
import { selectDualMomentumAtDate } from "../universe/DualMomentumSelector.js";
import { StaticUniverseProvider } from "../universe/EtfUniverse.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";

const startString =
  process.argv[2] ?? "2026-01-01";

const endString =
  process.argv[3] ?? "2026-08-08";

const start = new Date(startString);
const end = new Date(endString);

const dataStart = new Date(start);
dataStart.setUTCDate(
  dataStart.getUTCDate() -
    AGGRESSIVE_WARMUP_DAYS
);

const repository =
  new SQLiteCandleRepository(
    process.env.DATABASE_PATH ??
      "./data/market.db"
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

  const provider =
    new StaticUniverseProvider();

  const candidates =
    await provider.getCandidates();

  const symbols = [
    ...new Set([
      ...candidates.map(
        (c) => c.symbol
      ),
      "SPY"
    ])
  ];

  const candlesBySymbol =
    new Map<string, Candle[]>();

  for (const symbol of symbols) {
    candlesBySymbol.set(
      symbol,
      await loadCandles(
        loader,
        symbol,
        "1d",
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

  const result =
    new MultiSymbolBacktestEngine().run(
      availableCandidates,
      candlesBySymbol,
      () => new HoldStrategy(),
      {
        start,
        end,
        topCount: 1,
        selectionLookbackDays:
          AGGRESSIVE_LOOKBACK_DAYS,
        rebalanceFrequency: "daily",
        enterOnSelection: true,
        rotation: AGGRESSIVE_ROTATION_POLICY,
        portfolio: DEFAULT_PORTFOLIO,
        selector: {
          benchmarkSymbol: "SPY",
          lookbackDays:
            AGGRESSIVE_LOOKBACK_DAYS,
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
              lookbackDays:
                AGGRESSIVE_LOOKBACK_DAYS,
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

  const spyDaily =
    (candlesBySymbol.get("SPY") ?? [])
      .filter(
        (candle) =>
          candle.timestamp >= start &&
          candle.timestamp <= end
      );

  const spyStart =
    spyDaily[0]?.close ?? 0;
  const spyEnd =
    spyDaily.at(-1)?.close ?? 0;
  const spyReturn =
    spyStart > 0
      ? ((spyEnd - spyStart) / spyStart) * 100
      : 0;

  console.log(
    "=== Aggressive Daily Momentum ==="
  );
  console.log(
    `Period:              ${startString} → ${endString}`
  );
  console.log(
    "Logic:               daily rebalance · 10d momentum · 30 ETFs · SPY fallback"
  );
  console.log(
    `Initial cash:        $${DEFAULT_INITIAL_CASH.toLocaleString()}`
  );
  console.log("");
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
    `Avg daily return:    ${metrics.averageDailyReturn.toFixed(3)}%`
  );
  console.log(
    `Avg weekly return:   ${metrics.averageWeeklyReturn.toFixed(2)}%`
  );
  console.log(
    `SPY return:          ${spyReturn.toFixed(2)}%`
  );
  console.log(
    `Strategy vs SPY:     ${(result.returnPercent - spyReturn).toFixed(2)}%`
  );
} finally {
  repository.close();
}
