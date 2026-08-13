import type { Candle } from "../types/market.js";
import type { EtfCandidate } from "./EtfRank.js";
import {
  calculateReturnPercent
} from "./ScoringFactors.js";
import {
  applyUniverseFilter,
  DEFAULT_UNIVERSE_FILTER,
  type UniverseFilterOptions
} from "./UniverseFilter.js";
import type { SelectionSnapshot } from "./PointInTimeSelector.js";

export interface DualMomentumSelectorOptions {
  lookbackDays?: number;
  absoluteReturnMin?: number;
  topCount?: number;
  filter?: UniverseFilterOptions;
}

export const DEFAULT_DUAL_MOMENTUM_OPTIONS: Required<
  Omit<DualMomentumSelectorOptions, "topCount">
> & { topCount: number } = {
  lookbackDays: 126,
  absoluteReturnMin: 0,
  topCount: 1,
  filter: DEFAULT_UNIVERSE_FILTER
};

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

export function selectDualMomentumAtDate(
  asOfDate: Date,
  candidates: EtfCandidate[],
  candlesBySymbol: Map<string, Candle[]>,
  options: DualMomentumSelectorOptions = {}
): SelectionSnapshot {
  const resolved = {
    ...DEFAULT_DUAL_MOMENTUM_OPTIONS,
    ...options
  };

  const ranked: Array<{
    symbol: string;
    score: number;
    trailingReturn: number;
  }> = [];

  for (const candidate of candidates) {
    const history = candlesThroughDate(
      candlesBySymbol.get(
        candidate.symbol
      ) ?? [],
      asOfDate
    );

    const filterResult = applyUniverseFilter(
      history,
      resolved.filter
    );

    if (!filterResult.passed) {
      continue;
    }

    const trailingReturn =
      calculateReturnPercent(
        history,
        resolved.lookbackDays
      );

    if (trailingReturn === null) {
      continue;
    }

    ranked.push({
      symbol: candidate.symbol,
      score: trailingReturn,
      trailingReturn
    });
  }

  ranked.sort(
    (a, b) =>
      b.trailingReturn - a.trailingReturn
  );

  const winner = ranked[0];

  const selectedSymbols =
    winner &&
    winner.trailingReturn >
      resolved.absoluteReturnMin
      ? ranked
          .slice(0, resolved.topCount)
          .map((entry) => entry.symbol)
      : [];

  return {
    asOfDate,
    selectedSymbols,
    scores: ranked.map((entry) => ({
      symbol: entry.symbol,
      score: entry.score
    }))
  };
}
