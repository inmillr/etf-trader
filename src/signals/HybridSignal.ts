import type { Candle } from "../types/market.js";
import {
  evaluateDailyTrend,
  type DailyTrendOptions
} from "../backtest/DailyTrendGate.js";
import { dayKey } from "../backtest/IntradayExits.js";
import {
  IntradayMomentumStrategy,
  HYBRID_INTRADAY_OPTIONS
} from "../strategy/IntradayMomentumStrategy.js";
import type { EtfCandidate } from "../universe/EtfRank.js";
import {
  isRebalanceDate,
  selectTopEtfsAtDate,
  type RebalanceFrequency
} from "../universe/PointInTimeSelector.js";
import {
  countDaysHeld,
  resolveActiveSymbols,
  type RotationPolicyOptions
} from "../universe/RotationPolicy.js";
import {
  HYBRID_ROTATION_POLICY,
  HYBRID_SELECTION_LOOKBACK_DAYS,
  HYBRID_TREND_GATE,
  TUNED_UNIVERSE_FILTER
} from "../config/StrategyConfig.js";
import { DEFAULT_SCORING_WEIGHTS } from "../universe/ScoringFactors.js";

export type HybridSignalAction =
  | "buy"
  | "hold"
  | "rotate"
  | "exit"
  | "wait";

export interface HybridSignalResult {
  strategy: "hybrid";
  signalDate: string;
  selectionAsOfDate: string;
  action: HybridSignalAction;
  targetSymbol: string | null;
  heldSymbol: string | null;
  rawPick: string | null;
  isRebalanceDay: boolean;
  trendBullish: boolean;
  bearishCrossover: boolean;
  intradaySetup: boolean;
  inEntryWindow: boolean;
  trendFast: number | null;
  trendSlow: number | null;
  rankings: Array<{
    symbol: string;
    score: number;
  }>;
  reason: string;
}

export interface HybridSignalOptions {
  lookbackDays?: number;
  rebalanceFrequency?: RebalanceFrequency;
  rotation?: RotationPolicyOptions;
  trendGate?: DailyTrendOptions;
  heldSymbol?: string | null;
  heldSinceDay?: string | null;
}

function parseDay(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function dailyHistoryThroughPriorDay(
  dailyCandles: Candle[],
  day: string
): Candle[] {
  return dailyCandles.filter(
    (candle) =>
      dayKey(candle.timestamp) < day
  );
}

function resolveActiveHybridSymbol(
  signalDay: string,
  candidates: EtfCandidate[],
  dailyCandlesBySymbol: Map<string, Candle[]>,
  intradaySymbols: Set<string>,
  heldSymbol: string | null,
  heldSinceDay: string | null,
  lookbackDays: number,
  rotation: RotationPolicyOptions
): {
  selectionDate: string;
  activeSymbol: string | null;
  rawPick: string | null;
  rankings: HybridSignalResult["rankings"];
} {
  const priorDate = parseDay(signalDay);
  priorDate.setUTCDate(
    priorDate.getUTCDate() - 1
  );

  const selection = selectTopEtfsAtDate(
    priorDate,
    candidates,
    dailyCandlesBySymbol,
    {
      benchmarkSymbol: "SPY",
      lookbackDays,
      topCount: 1,
      weights: DEFAULT_SCORING_WEIGHTS,
      filter: TUNED_UNIVERSE_FILTER
    }
  );

  const rankings = selection.scores.map(
    (entry) => ({
      symbol: entry.symbol,
      score: entry.score
    })
  );

  const rawPick =
    selection.selectedSymbols[0] ?? null;

  const daysHeld =
    heldSymbol && heldSinceDay
      ? countDaysHeld(
          heldSinceDay,
          signalDay
        )
      : 0;

  let resolved = resolveActiveSymbols(
    selection,
    heldSymbol,
    daysHeld,
    rotation
  ).filter((symbol) =>
    intradaySymbols.has(symbol)
  );

  if (resolved.length === 0) {
    const fallback = selection.scores.find(
      (entry) =>
        intradaySymbols.has(entry.symbol)
    );

    if (fallback) {
      resolved = [fallback.symbol];
    }
  }

  return {
    selectionDate: dayKey(priorDate),
    activeSymbol: resolved[0] ?? null,
    rawPick,
    rankings
  };
}

function evaluateIntradaySetup(
  symbol: string,
  intradayCandles: Candle[]
): {
  setup: boolean;
  inEntryWindow: boolean;
} {
  if (intradayCandles.length === 0) {
    return {
      setup: false,
      inEntryWindow: false
    };
  }

  const strategy =
    new IntradayMomentumStrategy(
      HYBRID_INTRADAY_OPTIONS
    );

  const history: Candle[] = [];
  let pendingSetup = false;
  let lastInWindow = false;

  for (const candle of intradayCandles) {
    const order = strategy.onCandle({
      candle,
      history: [...history],
      cash: 10_000,
      positionQuantity: 0,
      estimatedBuyQuantity: 100
    });

    const minutes =
      candle.timestamp.getUTCHours() * 60 +
      candle.timestamp.getUTCMinutes();

    lastInWindow =
      minutes >=
        (HYBRID_INTRADAY_OPTIONS.entryWindowStartMinutes ??
          14 * 60 + 30) &&
      minutes <=
        (HYBRID_INTRADAY_OPTIONS.entryWindowEndMinutes ??
          17 * 60);

    if (order?.side === "buy") {
      pendingSetup = true;
    }

    history.push(candle);
  }

  return {
    setup: pendingSetup,
    inEntryWindow: lastInWindow
  };
}

export function evaluateHybridSignal(
  signalDay: string,
  candidates: EtfCandidate[],
  dailyCandlesBySymbol: Map<string, Candle[]>,
  intradayCandlesBySymbol: Map<string, Candle[]>,
  options: HybridSignalOptions = {}
): HybridSignalResult {
  const lookbackDays =
    options.lookbackDays ??
    HYBRID_SELECTION_LOOKBACK_DAYS;

  const rebalanceFrequency =
    options.rebalanceFrequency ??
    "weekly";

  const rotation =
    options.rotation ??
    HYBRID_ROTATION_POLICY;

  const trendGate =
    options.trendGate ??
    HYBRID_TREND_GATE;

  const heldSymbol =
    options.heldSymbol ?? null;

  const heldSinceDay =
    options.heldSinceDay ?? null;

  const signalDate = parseDay(signalDay);
  const isRebalanceDay =
    isRebalanceDate(
      signalDate,
      rebalanceFrequency
    );

  const intradaySymbols = new Set(
    intradayCandlesBySymbol.keys()
  );

  const {
    selectionDate,
    activeSymbol,
    rawPick,
    rankings
  } = resolveActiveHybridSymbol(
    signalDay,
    candidates,
    dailyCandlesBySymbol,
    intradaySymbols,
    heldSymbol,
    heldSinceDay ?? "",
    lookbackDays,
    rotation
  );

  const evaluateSymbol =
    heldSymbol ?? activeSymbol;

  const dailyHistory = evaluateSymbol
    ? dailyHistoryThroughPriorDay(
        dailyCandlesBySymbol.get(
          evaluateSymbol
        ) ?? [],
        signalDay
      )
    : [];

  const trend = evaluateDailyTrend(
    dailyHistory,
    trendGate
  );

  const trendBullish =
    trend?.bullishEntry ?? false;

  const bearishCrossover =
    trend?.bearishCrossover ?? false;

  const intradayCandles = evaluateSymbol
    ? (intradayCandlesBySymbol
        .get(evaluateSymbol)
        ?.filter(
          (candle) =>
            dayKey(candle.timestamp) ===
            signalDay
        ) ?? [])
    : [];

  const intradayState = evaluateSymbol
    ? evaluateIntradaySetup(
        evaluateSymbol,
        intradayCandles
      )
    : {
        setup: false,
        inEntryWindow: false
      };

  const base = {
    strategy: "hybrid" as const,
    signalDate: signalDay,
    selectionAsOfDate: selectionDate,
    rawPick,
    isRebalanceDay,
    trendBullish,
    bearishCrossover,
    intradaySetup: intradayState.setup,
    inEntryWindow: intradayState.inEntryWindow,
    trendFast: trend?.currentFast ?? null,
    trendSlow: trend?.currentSlow ?? null,
    rankings
  };

  if (
    heldSymbol &&
    bearishCrossover
  ) {
    return {
      ...base,
      action: "exit",
      targetSymbol: null,
      heldSymbol,
      reason:
        "Daily MA bearish crossover — exit on next bar."
    };
  }

  if (
    !activeSymbol &&
    !heldSymbol
  ) {
    return {
      ...base,
      action: "wait",
      targetSymbol: null,
      heldSymbol: null,
      reason:
        "No tradable symbol with 5m data in the active universe."
    };
  }

  if (
    heldSymbol &&
    activeSymbol &&
    activeSymbol !== heldSymbol &&
    isRebalanceDay
  ) {
    return {
      ...base,
      action: "rotate",
      targetSymbol: activeSymbol,
      heldSymbol,
      reason: `Weekly rebalance — rotate ${heldSymbol} → ${activeSymbol}.`
    };
  }

  if (
    !heldSymbol &&
    activeSymbol &&
    trendBullish &&
    intradayState.setup
  ) {
    return {
      ...base,
      action: "buy",
      targetSymbol: activeSymbol,
      heldSymbol: null,
      reason: `Intraday setup confirmed for ${activeSymbol} with bullish daily trend.`
    };
  }

  if (
    !heldSymbol &&
    activeSymbol &&
    trendBullish &&
    !intradayState.setup
  ) {
    return {
      ...base,
      action: "wait",
      targetSymbol: activeSymbol,
      heldSymbol: null,
      reason: intradayState.inEntryWindow
        ? `Watching ${activeSymbol} — bullish trend, waiting for 5m entry signal.`
        : `Bullish trend on ${activeSymbol}; entry window is 14:30–17:00 UTC.`
    };
  }

  if (
    !heldSymbol &&
    activeSymbol &&
    !trendBullish
  ) {
    return {
      ...base,
      action: "wait",
      targetSymbol: activeSymbol,
      heldSymbol: null,
      reason: `Universe pick ${activeSymbol}, but daily trend is not bullish yet.`
    };
  }

  if (heldSymbol) {
    return {
      ...base,
      action: "hold",
      targetSymbol: heldSymbol,
      heldSymbol,
      reason: `Hold ${heldSymbol}; monitoring stops and daily trend.`
    };
  }

  return {
    ...base,
    action: "wait",
    targetSymbol: activeSymbol,
    heldSymbol: null,
    reason: "No action."
  };
}

export function findLatestTradingDay(
  candlesBySymbol: Map<string, Candle[]>,
  benchmarkSymbol = "SPY"
): string | null {
  const benchmark =
    candlesBySymbol.get(benchmarkSymbol) ??
    Array.from(candlesBySymbol.values())[0];

  if (!benchmark?.length) {
    return null;
  }

  const latest = benchmark.reduce(
    (newest, candle) =>
      candle.timestamp.getTime() >
      newest.timestamp.getTime()
        ? candle
        : newest
  );

  return dayKey(latest.timestamp);
}
