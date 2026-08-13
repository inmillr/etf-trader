export interface TrendCondition {
  bullish: boolean;
  bearish: boolean;
}

export function evaluateTrend(
  price: number,
  ema9: number,
  ema20: number
): TrendCondition {
  return {
    bullish: price > ema9 && ema9 > ema20,
    bearish: price < ema9 && ema9 < ema20
  };
}

export interface VWAPCondition {
  bullish: boolean;
  bearish: boolean;
}

export function evaluateVWAP(
  price: number,
  vwap: number
): VWAPCondition {
  return {
    bullish: price > vwap,
    bearish: price < vwap
  };
}

export interface VolumeCondition {
  confirmed: boolean;
  relativeVolume: number;
}

export function evaluateVolume(
  relativeVolume: number,
  minimumRelativeVolume: number
): VolumeCondition {
  return {
    confirmed: relativeVolume >= minimumRelativeVolume,
    relativeVolume
  };
}

export interface RSICondition {
  bullish: boolean;
  bearish: boolean;
  value: number;
}

export function evaluateRSI(
  rsi: number,
  minimumBullishRSI: number,
  maximumBearishRSI: number
): RSICondition {
  return {
    bullish: rsi >= minimumBullishRSI,
    bearish: rsi <= maximumBearishRSI,
    value: rsi
  };
}