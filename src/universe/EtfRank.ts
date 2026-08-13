export type EtfCategory =
  | "broad"
  | "sector"
  | "thematic"
  | "international"
  | "fixed-income"
  | "commodity";

export interface EtfCandidate {
  symbol: string;
  name: string;
  category: EtfCategory;
}

export interface ScoringFactorValues {
  relativeMomentum5d: number;
  relativeMomentum20d: number;
  trendStrength: number;
  relativeVolume: number;
  volatilityFit: number;
  drawdown: number;
}

export interface RankedEtf {
  symbol: string;
  name: string;
  category: EtfCategory;
  rank: number;
  score: number;
  factors: ScoringFactorValues;
  passedFilter: boolean;
  filterReasons: string[];
}
