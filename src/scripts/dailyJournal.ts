import "dotenv/config";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { MultiSymbolBacktestEngine } from "../backtest/MultiSymbolBacktestEngine.js";
import {
  DEFAULT_INITIAL_CASH,
  DEFAULT_PORTFOLIO
} from "../config/PortfolioConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import { aggregateToDailyCandles } from "../market/DailyCandleAggregator.js";
import { HoldStrategy } from "../strategy/HoldStrategy.js";
import type { Candle } from "../types/market.js";
import { selectDualMomentumAtDate } from "../universe/DualMomentumSelector.js";
import {
  LIQUID_ETF_UNIVERSE,
  StaticUniverseProvider
} from "../universe/EtfUniverse.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

const args = process.argv.slice(2).filter(
  (arg) => !arg.startsWith("--")
);

const startString =
  args[0] ?? "2025-01-01";

const endString =
  args[1] ?? "2026-08-08";

const lookbackDays = Number(
  args[2] ?? 126
);

const initialCash = DEFAULT_INITIAL_CASH;
const warmupDays = lookbackDays + 35;

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

const dataStart = new Date(start);
dataStart.setUTCDate(
  dataStart.getUTCDate() - warmupDays
);

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
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

const repository =
  new SQLiteCandleRepository(
    databasePath
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
    let candles = await loader.load({
      symbol,
      timeframe: "1d",
      start: dataStart,
      end
    });

    if (candles.length === 0) {
      const intraday = await loader.load({
        symbol,
        timeframe: "5m",
        start: dataStart,
        end
      });

      candles = aggregateToDailyCandles(
        intraday
      );
    }

    candlesBySymbol.set(
      symbol,
      candles
    );
  }

  const availableCandidates =
    candidates.filter((c) =>
      (candlesBySymbol.get(c.symbol)?.length ?? 0) > 0
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
      rotation: rotationPolicy,
      portfolio: DEFAULT_PORTFOLIO,
      selector: {
        benchmarkSymbol: "SPY",
        lookbackDays,
        topCount: 1,
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

  const rebalanceDays = new Set(
    result.selections.map(
      (s) => s.date
    )
  );

  console.log(
    "=== Daily Journal (Dual Momentum) ==="
  );
  console.log(
    `Period: ${startString} → ${endString}`
  );
  console.log(
    "Date        Equity      Day %    Position  Note"
  );
  console.log(
    "-".repeat(56)
  );

  let previousEquity =
    result.initialCash;

  for (const point of result.equityCurve) {
    const day = dayKey(
      point.timestamp
    );

    const dayReturn =
      previousEquity > 0
        ? ((point.equity -
            previousEquity) /
            previousEquity) * 100
        : 0;

    const position =
      activeSymbolOnDay(
        day,
        result.selections
      );

    const note = rebalanceDays.has(day)
      ? "rebalance"
      : "";

    console.log(
      `${day}  ` +
      `$${point.equity.toFixed(2).padStart(9)}  ` +
      `${(dayReturn >= 0 ? "+" : "")}${dayReturn.toFixed(2).padStart(5)}%  ` +
      `${position.padEnd(8)}  ` +
      note
    );

    previousEquity = point.equity;
  }

  console.log("");
  console.log(
    `Total return: ${result.returnPercent.toFixed(2)}%  ` +
    `Max DD: ${result.maxDrawdown.toFixed(2)}%  ` +
    `Trades: ${result.trades}`
  );
} finally {
  repository.close();
}
