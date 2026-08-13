import type { Candle } from "../types/market.js";
import type {
  EtfCandidate,
  RankedEtf
} from "./EtfRank.js";
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

export interface CandleSource {
  getDailyCandles(
    symbol: string,
    lookbackDays: number
  ): Promise<Candle[]>;
}

export interface EtfScannerOptions {
  benchmarkSymbol?: string;
  lookbackDays?: number;
  filter?: UniverseFilterOptions;
  weights?: ScoringWeights;
}

export const DEFAULT_SCANNER_OPTIONS: Required<EtfScannerOptions> = {
  benchmarkSymbol: "SPY",
  lookbackDays: 60,
  filter: DEFAULT_UNIVERSE_FILTER,
  weights: DEFAULT_SCORING_WEIGHTS
};

export class EtfScanner {
  constructor(
    private readonly candleSource: CandleSource,
    private readonly options: EtfScannerOptions = {}
  ) {}

  async scan(
    candidates: EtfCandidate[]
  ): Promise<RankedEtf[]> {
    const resolvedOptions = {
      ...DEFAULT_SCANNER_OPTIONS,
      ...this.options
    };

    const benchmarkCandles =
      await this.candleSource.getDailyCandles(
        resolvedOptions.benchmarkSymbol,
        resolvedOptions.lookbackDays
      );

    const results: RankedEtf[] = [];

    for (const candidate of candidates) {
      const candles =
        await this.candleSource.getDailyCandles(
          candidate.symbol,
          resolvedOptions.lookbackDays
        );

      const filterResult = applyUniverseFilter(
        candles,
        resolvedOptions.filter
      );

      if (!filterResult.passed) {
        results.push({
          symbol: candidate.symbol,
          name: candidate.name,
          category: candidate.category,
          rank: 0,
          score: 0,
          factors: {
            relativeMomentum5d: 0,
            relativeMomentum20d: 0,
            trendStrength: 0,
            relativeVolume: 0,
            volatilityFit: 0,
            drawdown: 0
          },
          passedFilter: false,
          filterReasons: filterResult.reasons
        });

        continue;
      }

      const factors = calculateScoringFactors(
        candles,
        benchmarkCandles
      );

      const score = calculateCompositeScore(
        factors,
        resolvedOptions.weights
      );

      results.push({
        symbol: candidate.symbol,
        name: candidate.name,
        category: candidate.category,
        rank: 0,
        score,
        factors,
        passedFilter: true,
        filterReasons: []
      });
    }

    const ranked = results
      .filter((result) => result.passedFilter)
      .sort(
        (a, b) =>
          b.score - a.score
      );

    for (let i = 0; i < ranked.length; i++) {
      ranked[i]!.rank = i + 1;
    }

    const filteredOut = results
      .filter((result) => !result.passedFilter)
      .sort(
        (a, b) =>
          a.symbol.localeCompare(b.symbol)
      );

    return [...ranked, ...filteredOut];
  }

  async scanTop(
    candidates: EtfCandidate[],
    count: number
  ): Promise<RankedEtf[]> {
    const results = await this.scan(candidates);

    return results
      .filter((result) => result.passedFilter)
      .slice(0, count);
  }
}
