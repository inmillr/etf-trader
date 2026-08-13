export function calculateEMA(
  values: number[],
  period: number
): number[] {
  if (period <= 0) {
    throw new Error("Period must be greater than zero.");
  }

  if (values.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  // Start with an SMA as the initial EMA value.
  let sum = 0;

  for (let i = 0; i < period; i++) {
    sum += values[i]!;
  }

  let previousEMA = sum / period;
  result.push(previousEMA);

  // Calculate subsequent EMA values.
  for (let i = period; i < values.length; i++) {
    const currentValue = values[i]!;

    const currentEMA =
      (currentValue - previousEMA) * multiplier + previousEMA;

    result.push(currentEMA);
    previousEMA = currentEMA;
  }

  return result;
}