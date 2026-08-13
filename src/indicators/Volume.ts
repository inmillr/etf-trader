import type { Candle } from "../types/market.js";

export function calculateRelativeVolume(
  candles: Candle[],
  period: number
): number[] {
  if (period <= 0) {
    throw new Error("Period must be greater than zero.");
  }

  if (candles.length <= period) {
    return [];
  }

  const result: number[] = [];

  for (let i = period; i < candles.length; i++) {
    let volumeSum = 0;

    for (let j = i - period; j < i; j++) {
      volumeSum += candles[j]!.volume;
    }

    const averageVolume = volumeSum / period;

    if (averageVolume === 0) {
      result.push(0);
      continue;
    }

    result.push(candles[i]!.volume / averageVolume);
  }

  return result;
}