export function calculateSMA(
  values: number[],
  period: number
): number[] {
  if (period <= 0) {
    throw new Error("Period must be greater than zero.");
  }

  if (values.length < period) {
    return [];
  }

  const result: number[] = [];

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;

    for (let j = i - period + 1; j <= i; j++) {
      sum += values[j]!;
    }

    result.push(sum / period);
  }

  return result;
}