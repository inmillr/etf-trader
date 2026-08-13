import type { Candle } from "../types/market.js";
import type { EtfCandidate } from "./EtfRank.js";
import {
  calculateCompositeScore,
  calculateScoringFactors,
  DEFAULT_SCORING_WEIGHTS,
  type ScoringWeights
} from "./ScoringFactors.js";
import {
  applyUniverseFilter,
  DEFAULT_UNIVERSE_FILTER,
  type UniverseFilterOptions
} from "./UniverseFilter.js";

export type RebalanceFrequency =
  | "daily"
  | "weekly";

export interface PointInTimeSelectorOptions {
  benchmarkSymbol?: string;
  lookbackDays?: number;
  topCount?: number;
  filter?: UniverseFilterOptions;
  weights?: ScoringWeights;
  maxCorrelation?: number;
}

export const DEFAULT_SELECTOR_OPTIONS: Required<
  Omit<PointInTimeSelectorOptions, "topCount">
> & { topCount: number } = {
  benchmarkSymbol: "SPY",
  lookbackDays: 30,
  topCount: 1,
  filter: DEFAULT_UNIVERSE_FILTER,
  weights: DEFAULT_SCORING_WEIGHTS,
  maxCorrelation: 0.85
};

export interface SelectionSnapshot {
  asOfDate: Date;
  selectedSymbols: string[];
  scores: Array<{
    symbol: string;
    score: number;
  }>;
  momentumSymbol?: string | null;
  usedFallback?: boolean;
}

function candlesThroughDate(
  candles: Candle[],
  asOfDate: Date
): Candle[] {
  const endOfDay = new Date(asOfDate);

  endOfDay.setUTCHours(23, 59, 59, 999);

  return candles
    .filter(
      (candle) =>
        candle.timestamp.getTime() <=
        endOfDay.getTime()
    )
    .sort(
      (a, b) =>
        a.timestamp.getTime() -
        b.timestamp.getTime()
    );
}

function recentCandles(
  candles: Candle[],
  lookbackDays: number
): Candle[] {
  if (candles.length <= lookbackDays) {
    return candles;
  }

  return candles.slice(-lookbackDays);
}

function dailyReturns(
  candles: Candle[]
): number[] {
  const returns: number[] = [];

  for (
    let i = 1;
    i < candles.length;
    i++
  ) {
    const previous =
      candles[i - 1]!.close;

    if (previous === 0) {
      continue;
    }

    returns.push(
      (candles[i]!.close - previous) /
      previous
    );
  }

  return returns;
}

export function calculateReturnCorrelation(
  left: Candle[],
  right: Candle[],
  period = 20
): number {
  const leftReturns = dailyReturns(
    left.slice(-period - 1)
  );

  const rightReturns = dailyReturns(
    right.slice(-period - 1)
  );

  const count = Math.min(
    leftReturns.length,
    rightReturns.length
  );

  if (count < 5) {
    return 0;
  }

  const alignedLeft =
    leftReturns.slice(-count);

  const alignedRight =
    rightReturns.slice(-count);

  const leftMean =
    alignedLeft.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / count;

  const rightMean =
    alignedRight.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / count;

  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const leftDelta =
      alignedLeft[i]! - leftMean;

    const rightDelta =
      alignedRight[i]! - rightMean;

    covariance +=
      leftDelta * rightDelta;

    leftVariance +=
      leftDelta * leftDelta;

    rightVariance +=
      rightDelta * rightDelta;
  }

  if (
    leftVariance === 0 ||
    rightVariance === 0
  ) {
    return 0;
  }

  return covariance /
    Math.sqrt(
      leftVariance * rightVariance
    );
}

function selectUncorrelatedSymbols(
  scored: Array<{
    symbol: string;
    score: number;
  }>,
  candlesBySymbol: Map<string, Candle[]>,
  asOfDate: Date,
  topCount: number,
  maxCorrelation: number,
  lookbackDays: number
): string[] {
  const selected: string[] = [];

  for (const entry of scored) {
    if (
      selected.length >= topCount
    ) {
      break;
    }

    const candidateHistory = recentCandles(
      candlesThroughDate(
        candlesBySymbol.get(
          entry.symbol
        ) ?? [],
        asOfDate
      ),
      lookbackDays
    );

    const tooCorrelated = selected.some(
      (symbol) => {
        const selectedHistory = recentCandles(
          candlesThroughDate(
            candlesBySymbol.get(
              symbol
            ) ?? [],
            asOfDate
          ),
          lookbackDays
        );

        return (
          calculateReturnCorrelation(
            candidateHistory,
            selectedHistory
          ) > maxCorrelation
        );
      }
    );

    if (!tooCorrelated) {
      selected.push(entry.symbol);
    }
  }

  return selected;
}

export function selectTopEtfsAtDate(
  asOfDate: Date,
  candidates: EtfCandidate[],
  candlesBySymbol: Map<string, Candle[]>,
  options: PointInTimeSelectorOptions = {}
): SelectionSnapshot {
  const resolved = {
    ...DEFAULT_SELECTOR_OPTIONS,
    ...options
  };

  const benchmarkHistory = recentCandles(
    candlesThroughDate(
      candlesBySymbol.get(
        resolved.benchmarkSymbol
      ) ?? [],
      asOfDate
    ),
    resolved.lookbackDays
  );

  const scored: Array<{
    symbol: string;
    score: number;
  }> = [];

  for (const candidate of candidates) {
    const history = recentCandles(
      candlesThroughDate(
        candlesBySymbol.get(
          candidate.symbol
        ) ?? [],
        asOfDate
      ),
      resolved.lookbackDays
    );

    const filterResult = applyUniverseFilter(
      history,
      resolved.filter
    );

    if (!filterResult.passed) {
      continue;
    }

    const factors = calculateScoringFactors(
      history,
      benchmarkHistory
    );

    scored.push({
      symbol: candidate.symbol,
      score: calculateCompositeScore(
        factors,
        resolved.weights
      )
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score
  );

  const selectedSymbols =
    selectUncorrelatedSymbols(
      scored,
      candlesBySymbol,
      asOfDate,
      resolved.topCount,
      resolved.maxCorrelation,
      resolved.lookbackDays
    );

  return {
    asOfDate,
    selectedSymbols,
    scores: scored
  };
}

export function isWeeklyRebalanceDate(
  date: Date
): boolean {
  return date.getUTCDay() === 1;
}

export function isRebalanceDate(
  date: Date,
  frequency: RebalanceFrequency
): boolean {
  if (frequency === "daily") {
    return true;
  }

  return isWeeklyRebalanceDate(date);
}
