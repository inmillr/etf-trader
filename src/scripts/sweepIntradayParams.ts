import "dotenv/config";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { MultiSymbolIntradayBacktestEngine } from "../backtest/MultiSymbolIntradayBacktestEngine.js";
import { DEFAULT_PORTFOLIO } from "../config/PortfolioConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import {
  IntradayMomentumStrategy,
  type IntradayMomentumOptions
} from "../strategy/IntradayMomentumStrategy.js";
import type { Candle, Timeframe } from "../types/market.js";
import { StaticUniverseProvider } from "../universe/EtfUniverse.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";

const databasePath =
  process.env.DATABASE_PATH ?? "./data/market.db";

const startString = process.argv[2] ?? "2026-01-01";
const endString = process.argv[3] ?? "2026-08-08";

const start = new Date(startString);
const end = new Date(endString);
const selectionLookbackDays = 30;
const slowPeriod = 50;
const warmupDays = selectionLookbackDays + slowPeriod + 5;
const dataStart = new Date(start);
dataStart.setUTCDate(dataStart.getUTCDate() - warmupDays);

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

const variants: Array<{ name: string; options: IntradayMomentumOptions }> = [
  {
    name: "current-tuned",
    options: {
      signalParameters: {
        minimumRelativeVolume: 1.0,
        minimumBullishRSI: 50,
        maximumBearishRSI: 40
      },
      atrMultiplier: 2.0,
      rewardRiskRatio: 1.5
    }
  },
  {
    name: "strict-morning",
    options: {
      signalParameters: {
        minimumRelativeVolume: 1.3,
        minimumBullishRSI: 55,
        maximumBearishRSI: 40
      },
      atrMultiplier: 2.5,
      rewardRiskRatio: 2.0,
      entryWindowStartMinutes: 14 * 60 + 30,
      entryWindowEndMinutes: 17 * 60
    }
  },
  {
    name: "wide-stop-afternoon",
    options: {
      signalParameters: {
        minimumRelativeVolume: 1.2,
        minimumBullishRSI: 52,
        maximumBearishRSI: 38
      },
      atrMultiplier: 3.0,
      rewardRiskRatio: 2.5,
      entryWindowStartMinutes: 15 * 60 + 30,
      entryWindowEndMinutes: 19 * 60 + 30
    }
  }
];

const repository = new SQLiteCandleRepository(databasePath);

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
  const loader = new BacktestDataLoader(repository);
  const provider = new StaticUniverseProvider();
  const candidates = await provider.getCandidates();
  const symbols = [
    ...new Set([
      ...candidates.map((candidate) => candidate.symbol),
      "SPY"
    ])
  ];

  const dailyCandlesBySymbol = new Map<string, Candle[]>();
  const intradayCandlesBySymbol = new Map<string, Candle[]>();

  for (const symbol of symbols) {
    dailyCandlesBySymbol.set(
      symbol,
      await loadCandles(loader, symbol, "1d", dataStart, end)
    );

    const intraday = await loadCandles(
      loader,
      symbol,
      "5m",
      start,
      end
    );

    if (intraday.length > 0) {
      intradayCandlesBySymbol.set(symbol, intraday);
    }
  }

  const availableCandidates = candidates.filter((candidate) =>
    dailyCandlesBySymbol.get(candidate.symbol)?.length
  );

  const engine = new MultiSymbolIntradayBacktestEngine();

  console.log(`Sweep ${startString} → ${endString}\n`);

  for (const variant of variants) {
    const result = engine.run(
      availableCandidates,
      dailyCandlesBySymbol,
      intradayCandlesBySymbol,
      () => new IntradayMomentumStrategy(variant.options),
      {
        start,
        end,
        topCount: 1,
        selectionLookbackDays,
        rebalanceFrequency: "weekly",
        rotation: rotationPolicy,
        closeAtEndOfDay: true,
        portfolio: DEFAULT_PORTFOLIO,
        selector: {
          benchmarkSymbol: "SPY",
          lookbackDays: selectionLookbackDays,
          topCount: 1,
          weights: DEFAULT_SCORING_WEIGHTS,
          filter: tunedFilter
        }
      }
    );

    console.log(
      `${variant.name.padEnd(22)} ` +
        `return ${result.returnPercent.toFixed(2)}%  ` +
        `DD ${result.maxDrawdown.toFixed(2)}%  ` +
        `trades ${result.trades}  ` +
        `exposure ${result.exposurePercent.toFixed(1)}%  ` +
        `stop/target ${result.stopExits}/${result.targetExits}`
    );
  }
} finally {
  repository.close();
}
