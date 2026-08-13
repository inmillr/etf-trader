import type { Candle } from "../types/market.js";

export function calculateATR(
  candles: Candle[],
  period: number
): number[] {
  if (period <= 0) {
    throw new Error("Period must be greater than zero.");
  }

  if (candles.length <= period) {
    return [];
  }

  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i]!;
    const previous = candles[i - 1]!;

    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    trueRanges.push(trueRange);
  }

  if (trueRanges.length < period) {
    return [];
  }

  let initialSum = 0;

  for (let i = 0; i < period; i++) {
    initialSum += trueRanges[i]!;
  }

  let previousATR = initialSum / period;

  const result: number[] = [previousATR];

  for (let i = period; i < trueRanges.length; i++) {
    const currentTrueRange = trueRanges[i]!;

    const currentATR =
      ((previousATR * (period - 1)) + currentTrueRange) / period;

    result.push(currentATR);

    previousATR = currentATR;
  }

  return result;
}