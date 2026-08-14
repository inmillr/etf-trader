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

const startString =
  process.argv[2] ?? "2025-01-01";

const endString =
  process.argv[3] ?? "2026-08-13";

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

function pad(value: string, width: number): string {
  return value.padStart(width);
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
        (candidate) => candidate.symbol
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

  const engine =
    new MultiSymbolBacktestEngine();

  const shared = {
    start,
    end,
    topCount: 1 as const,
    selectionLookbackDays:
      AGGRESSIVE_LOOKBACK_DAYS,
    rebalanceFrequency: "daily" as const,
    enterOnSelection: true,
    rotation: AGGRESSIVE_ROTATION_POLICY,
    portfolio: DEFAULT_PORTFOLIO,
    selector: {
      benchmarkSymbol: "SPY",
      lookbackDays: AGGRESSIVE_LOOKBACK_DAYS,
      topCount: 1,
      filter: TUNED_UNIVERSE_FILTER
    },
    selectAtDate: (
      asOfDate: Date,
      available: typeof availableCandidates,
      candles: Map<string, Candle[]>,
      context: { topCount: number }
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
  };

  function runTiming(
    executionTiming: "next-open" | "prior-close" | "same-close"
  ) {
    return engine.run(
      availableCandidates,
      candlesBySymbol,
      () => new HoldStrategy(),
      {
        ...shared,
        executionTiming
      }
    );
  }

  const nextOpen = runTiming("next-open");
  const priorClose = runTiming("prior-close");
  const sameClose = runTiming("same-close");

  const nextOpenMetrics =
    calculatePeriodReturnMetrics(
      nextOpen.equityCurve
    );
  const priorCloseMetrics =
    calculatePeriodReturnMetrics(
      priorClose.equityCurve
    );
  const sameCloseMetrics =
    calculatePeriodReturnMetrics(
      sameClose.equityCurve
    );

  const spyDaily =
    (candlesBySymbol.get("SPY") ?? [])
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

  const overnightOnly =
    priorClose.returnPercent -
    nextOpen.returnPercent;
  const sameDayRanking =
    sameClose.returnPercent -
    priorClose.returnPercent;
  const combined =
    sameClose.returnPercent -
    nextOpen.returnPercent;

  const rows: Array<
    [string, string, string, string]
  > = [
    [
      "Total return",
      `${nextOpen.returnPercent.toFixed(2)}%`,
      `${priorClose.returnPercent.toFixed(2)}%`,
      `${sameClose.returnPercent.toFixed(2)}%`
    ],
    [
      "Final equity",
      `$${nextOpen.finalEquity.toFixed(2)}`,
      `$${priorClose.finalEquity.toFixed(2)}`,
      `$${sameClose.finalEquity.toFixed(2)}`
    ],
    [
      "Max drawdown",
      `${nextOpen.maxDrawdown.toFixed(2)}%`,
      `${priorClose.maxDrawdown.toFixed(2)}%`,
      `${sameClose.maxDrawdown.toFixed(2)}%`
    ],
    [
      "Trades",
      String(nextOpen.trades),
      String(priorClose.trades),
      String(sameClose.trades)
    ],
    [
      "Avg daily",
      `${nextOpenMetrics.averageDailyReturn.toFixed(3)}%`,
      `${priorCloseMetrics.averageDailyReturn.toFixed(3)}%`,
      `${sameCloseMetrics.averageDailyReturn.toFixed(3)}%`
    ],
    [
      "Avg weekly",
      `${nextOpenMetrics.averageWeeklyReturn.toFixed(2)}%`,
      `${priorCloseMetrics.averageWeeklyReturn.toFixed(2)}%`,
      `${sameCloseMetrics.averageWeeklyReturn.toFixed(2)}%`
    ],
    [
      "vs SPY",
      `${(nextOpen.returnPercent - spyReturn).toFixed(2)}%`,
      `${(priorClose.returnPercent - spyReturn).toFixed(2)}%`,
      `${(sameClose.returnPercent - spyReturn).toFixed(2)}%`
    ]
  ];

  console.log(
    "=== Execution timing comparison ==="
  );
  console.log(
    `Period:     ${startString} → ${endString}`
  );
  console.log(
    `Initial:    $${DEFAULT_INITIAL_CASH.toLocaleString()}`
  );
  console.log(
    `SPY return: ${spyReturn.toFixed(2)}%`
  );
  console.log(
    "next-open:   rank yesterday, fill next morning (old 9:35 AM)"
  );
  console.log(
    "prior-close: rank yesterday, fill today's close (overnight only)"
  );
  console.log(
    "same-close:  rank today, fill today's close (new 3:55 PM)"
  );
  console.log("");
  console.log(
    `${"Metric".padEnd(16)}${pad("next-open", 18)}${pad("prior-close", 18)}${pad("same-close", 18)}`
  );

  for (const [label, a, b, c] of rows) {
    console.log(
      `${label.padEnd(16)}${pad(a, 18)}${pad(b, 18)}${pad(c, 18)}`
    );
  }

  console.log("");
  console.log(
    `Overnight / skip-open:  ${overnightOnly >= 0 ? "+" : ""}${overnightOnly.toFixed(2)}%  (prior-close − next-open)`
  );
  console.log(
    `Same-day ranking:       ${sameDayRanking >= 0 ? "+" : ""}${sameDayRanking.toFixed(2)}%  (same-close − prior-close)`
  );
  console.log(
    `Combined (new − old):   ${combined >= 0 ? "+" : ""}${combined.toFixed(2)}%`
  );
} finally {
  repository.close();
}
