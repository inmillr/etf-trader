import type { Candle } from "../types/market.js";

export function calculateVWAP(candles: Candle[]): number[] {
  if (candles.length === 0) {
    return [];
  }

  const result: number[] = [];

  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice =
      (candle.high + candle.low + candle.close) / 3;

    cumulativePriceVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;

    if (cumulativeVolume === 0) {
      result.push(0);
      continue;
    }

    result.push(
      cumulativePriceVolume / cumulativeVolume
    );
  }

  return result;
}