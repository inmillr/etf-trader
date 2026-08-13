import { calculateATR } from "../indicators/ATR.js";
import { calculateEMA } from "../indicators/EMA.js";
import { calculateRelativeVolume } from "../indicators/Volume.js";
import type { Candle } from "../types/market.js";
import type { ScoringFactorValues } from "./EtfRank.js";

export interface ScoringWeights {
  relativeMomentum5d: number;
  relativeMomentum20d: number;
  trendStrength: number;
  relativeVolume: number;
  volatilityFit: number;
  drawdownPenalty: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  relativeMomentum5d: 0.25,
  relativeMomentum20d: 0.15,
  trendStrength: 0.20,
  relativeVolume: 0.15,
  volatilityFit: 0.05,
  drawdownPenalty: 0.20
};

export interface VolatilityFitOptions {
  idealMinPercent: number;
  idealMaxPercent: number;
}

export const DEFAULT_VOLATILITY_FIT: VolatilityFitOptions = {
  idealMinPercent: 1.0,
  idealMaxPercent: 4.0
};

export function calculateReturnPercent(
  candles: Candle[],
  period: number
): number | null {
  if (candles.length <= period) {
    return null;
  }

  const sorted = [...candles].sort(
    (a, b) =>
      a.timestamp.getTime() -
      b.timestamp.getTime()
  );

  const current =
    sorted[sorted.length - 1]!.close;

  const previous =
    sorted[sorted.length - 1 - period]!.close;

  if (previous === 0) {
    return null;
  }

  return (
    (current - previous) /
    previous
  ) * 100;
}

export function calculateRelativeMomentum(
  symbolCandles: Candle[],
  benchmarkCandles: Candle[],
  period: number
): number {
  const symbolReturn =
    calculateReturnPercent(
      symbolCandles,
      period
    );

  const benchmarkReturn =
    calculateReturnPercent(
      benchmarkCandles,
      period
    );

  if (
    symbolReturn === null ||
    benchmarkReturn === null
  ) {
    return 0;
  }

  return symbolReturn - benchmarkReturn;
}

export function calculateTrendStrength(
  candles: Candle[]
): number {
  const sorted = [...candles].sort(
    (a, b) =>
      a.timestamp.getTime() -
      b.timestamp.getTime()
  );

  const closes = sorted.map(
    (candle) => candle.close
  );

  const ema9Values = calculateEMA(closes, 9);
  const ema20Values = calculateEMA(closes, 20);

  if (
    ema9Values.length === 0 ||
    ema20Values.length === 0
  ) {
    return 0;
  }

  const price = closes[closes.length - 1]!;
  const ema9 = ema9Values[ema9Values.length - 1]!;
  const ema20 = ema20Values[ema20Values.length - 1]!;

  if (price > ema9 && ema9 > ema20) {
    const extension =
      (price - ema9) / ema9;

    return Math.min(
      1,
      0.7 + extension * 15
    );
  }

  if (ema9 > ema20) {
    return 0.4;
  }

  if (price > ema20) {
    return 0.2;
  }

  return 0;
}

export function calculateRelativeVolumeScore(
  candles: Candle[],
  period = 20
): number {
  const sorted = [...candles].sort(
    (a, b) =>
      a.timestamp.getTime() -
      b.timestamp.getTime()
  );

  const values = calculateRelativeVolume(
    sorted,
    period
  );

  if (values.length === 0) {
    return 0;
  }

  const latest = values[values.length - 1]!;

  return Math.min(1, latest / 2);
}

export function calculateVolatilityFit(
  candles: Candle[],
  options: VolatilityFitOptions =
    DEFAULT_VOLATILITY_FIT,
  atrPeriod = 14
): number {
  const sorted = [...candles].sort(
    (a, b) =>
      a.timestamp.getTime() -
      b.timestamp.getTime()
  );

  const atrValues = calculateATR(
    sorted,
    atrPeriod
  );

  if (atrValues.length === 0) {
    return 0;
  }

  const latestClose =
    sorted[sorted.length - 1]!.close;

  if (latestClose === 0) {
    return 0;
  }

  const atrPercent =
    (atrValues[atrValues.length - 1]! /
      latestClose) * 100;

  const midpoint =
    (options.idealMinPercent +
      options.idealMaxPercent) / 2;

  const halfRange =
    (options.idealMaxPercent -
      options.idealMinPercent) / 2;

  if (halfRange === 0) {
    return atrPercent === midpoint ? 1 : 0;
  }

  const distance =
    Math.abs(atrPercent - midpoint);

  return Math.max(
    0,
    1 - distance / halfRange
  );
}

export function calculateDrawdown(
  candles: Candle[]
): number {
  const sorted = [...candles].sort(
    (a, b) =>
      a.timestamp.getTime() -
      b.timestamp.getTime()
  );

  if (sorted.length === 0) {
    return 0;
  }

  let peak = sorted[0]!.close;
  let maxDrawdown = 0;

  for (const candle of sorted) {
    if (candle.close > peak) {
      peak = candle.close;
    }

    const drawdown =
      ((peak - candle.close) / peak) * 100;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

export function normalizeRelativeMomentum(
  value: number
): number {
  return Math.max(
    0,
    Math.min(1, (value + 5) / 10)
  );
}

export function calculateScoringFactors(
  symbolCandles: Candle[],
  benchmarkCandles: Candle[]
): ScoringFactorValues {
  return {
    relativeMomentum5d: calculateRelativeMomentum(
      symbolCandles,
      benchmarkCandles,
      5
    ),
    relativeMomentum20d: calculateRelativeMomentum(
      symbolCandles,
      benchmarkCandles,
      20
    ),
    trendStrength: calculateTrendStrength(
      symbolCandles
    ),
    relativeVolume: calculateRelativeVolumeScore(
      symbolCandles
    ),
    volatilityFit: calculateVolatilityFit(
      symbolCandles
    ),
    drawdown: calculateDrawdown(
      symbolCandles
    )
  };
}

export function calculateCompositeScore(
  factors: ScoringFactorValues,
  weights: ScoringWeights =
    DEFAULT_SCORING_WEIGHTS
): number {
  const momentum5Component =
    normalizeRelativeMomentum(
      factors.relativeMomentum5d
    ) * weights.relativeMomentum5d;

  const momentum20Component =
    normalizeRelativeMomentum(
      factors.relativeMomentum20d
    ) * weights.relativeMomentum20d;

  const trendComponent =
    factors.trendStrength *
    weights.trendStrength;

  const volumeComponent =
    factors.relativeVolume *
    weights.relativeVolume;

  const volatilityComponent =
    factors.volatilityFit *
    weights.volatilityFit;

  const drawdownComponent =
    Math.min(
      1,
      factors.drawdown / 20
    ) * weights.drawdownPenalty;

  const rawScore =
    momentum5Component +
    momentum20Component +
    trendComponent +
    volumeComponent +
    volatilityComponent -
    drawdownComponent;

  return Math.max(0, rawScore * 100);
}
