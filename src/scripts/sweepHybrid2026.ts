import "dotenv/config";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { MultiSymbolHybridBacktestEngine } from "../backtest/MultiSymbolHybridBacktestEngine.js";
import { DEFAULT_PORTFOLIO } from "../config/PortfolioConfig.js";
import {
  DEFAULT_ROTATION_POLICY,
  HYBRID_SELECTION_LOOKBACK_DAYS,
  HYBRID_TREND_GATE,
  HYBRID_WARMUP_DAYS,
  TUNED_UNIVERSE_FILTER
} from "../config/StrategyConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import {
  IntradayMomentumStrategy,
  TUNED_INTRADAY_OPTIONS,
  type IntradayMomentumOptions
} from "../strategy/IntradayMomentumStrategy.js";
import type { Candle, Timeframe } from "../types/market.js";
import type { EtfCandidate } from "../universe/EtfRank.js";
import {
  LIQUID_ETF_UNIVERSE,
  StaticUniverseProvider
} from "../universe/EtfUniverse.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";
import type { RotationPolicyOptions } from "../universe/RotationPolicy.js";

const startString = process.argv[2] ?? "2026-01-01";
const endString = process.argv[3] ?? "2026-08-08";

const start = new Date(startString);
const end = new Date(endString);

interface Variant {
  name: string;
  candidates: EtfCandidate[];
  rotation: RotationPolicyOptions;
  intraday: IntradayMomentumOptions;
}

const wideStopIntraday: IntradayMomentumOptions = {
  signalParameters: {
    minimumRelativeVolume: 1.2,
    minimumBullishRSI: 52,
    maximumBearishRSI: 38
  },
  atrMultiplier: 3.0,
  riskPercent: 1,
  maxPositionPercent: 100,
  rewardRiskRatio: 2.5,
  entryWindowStartMinutes: 14 * 60 + 30,
  entryWindowEndMinutes: 17 * 60
};

const fullProvider =
  new StaticUniverseProvider();

const fullCandidates =
  await fullProvider.getCandidates();

const variants: Variant[] = [
  {
    name: "baseline-full-30",
    candidates: fullCandidates,
    rotation: DEFAULT_ROTATION_POLICY,
    intraday: TUNED_INTRADAY_OPTIONS
  },
  {
    name: "liquid-4-etfs",
    candidates: LIQUID_ETF_UNIVERSE,
    rotation: DEFAULT_ROTATION_POLICY,
    intraday: TUNED_INTRADAY_OPTIONS
  },
  {
    name: "liquid-tight-rotation",
    candidates: LIQUID_ETF_UNIVERSE,
    rotation: {
      minHoldDays: 10,
      minScoreImprovement: 10
    },
    intraday: TUNED_INTRADAY_OPTIONS
  },
  {
    name: "liquid-wide-stop",
    candidates: LIQUID_ETF_UNIVERSE,
    rotation: DEFAULT_ROTATION_POLICY,
    intraday: wideStopIntraday
  },
  {
    name: "liquid-wide-stop-tight-rot",
    candidates: LIQUID_ETF_UNIVERSE,
    rotation: {
      minHoldDays: 10,
      minScoreImprovement: 10
    },
    intraday: wideStopIntraday
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

  const dataStart = new Date(start);
  dataStart.setUTCDate(
    dataStart.getUTCDate() -
      HYBRID_WARMUP_DAYS
  );

  const allSymbols = [
    ...new Set([
      ...fullCandidates.map(
        (candidate) => candidate.symbol
      ),
      "SPY"
    ])
  ];

  console.log(
    `Hybrid sweep ${startString} → ${endString}`
  );
  console.log(
    "Loading daily + 5m candles..."
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

  console.log(
    `SPY buy-and-hold: ${spyReturn.toFixed(2)}%\n`
  );

  const engine =
    new MultiSymbolHybridBacktestEngine();

  const rows: Array<{
    name: string;
    returnPercent: number;
    maxDrawdown: number;
    trades: number;
    stopExits: number;
    targetExits: number;
    vsSpy: number;
  }> = [];

  for (const variant of variants) {
    const availableCandidates =
      variant.candidates.filter(
        (candidate) =>
          (dailyCandlesBySymbol.get(
            candidate.symbol
          )?.length ?? 0) > 0
      );

    const result = engine.run(
      availableCandidates,
      dailyCandlesBySymbol,
      intradayCandlesBySymbol,
      () =>
        new IntradayMomentumStrategy(
          variant.intraday
        ),
      {
        start,
        end,
        topCount: 1,
        selectionLookbackDays:
          HYBRID_SELECTION_LOOKBACK_DAYS,
        rebalanceFrequency: "weekly",
        rotation: variant.rotation,
        portfolio: DEFAULT_PORTFOLIO,
        selector: {
          benchmarkSymbol: "SPY",
          lookbackDays:
            HYBRID_SELECTION_LOOKBACK_DAYS,
          topCount: 1,
          weights: DEFAULT_SCORING_WEIGHTS,
          filter: TUNED_UNIVERSE_FILTER
        },
        trendGate: HYBRID_TREND_GATE
      }
    );

    rows.push({
      name: variant.name,
      returnPercent: result.returnPercent,
      maxDrawdown: result.maxDrawdown,
      trades: result.trades,
      stopExits: result.stopExits,
      targetExits: result.targetExits,
      vsSpy:
        result.returnPercent - spyReturn
    });
  }

  rows.sort(
    (a, b) =>
      b.returnPercent - a.returnPercent
  );

  console.log(
    "Variant                         Return   vs SPY   MaxDD   Trades  Stop  Tgt"
  );
  console.log(
    "──────────────────────────────────────────────────────────────────────────"
  );

  for (const row of rows) {
    console.log(
      `${row.name.padEnd(30)} ${row.returnPercent.toFixed(2).padStart(6)}% ${row.vsSpy.toFixed(2).padStart(7)}% ${row.maxDrawdown.toFixed(1).padStart(6)}% ${String(row.trades).padStart(6)} ${String(row.stopExits).padStart(5)} ${String(row.targetExits).padStart(4)}`
    );
  }
} finally {
  repository.close();
}
