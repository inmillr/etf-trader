export function calculateRSI(
  values: number[],
  period: number
): number[] {
  if (period <= 0) {
    throw new Error("Period must be greater than zero.");
  }

  if (values.length <= period) {
    return [];
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i]! - values[i - 1]!;

    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  const result: number[] = [];

  result.push(calculateRSIValue(averageGain, averageLoss));

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i]! - values[i - 1]!;

    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    averageGain =
      ((averageGain * (period - 1)) + gain) / period;

    averageLoss =
      ((averageLoss * (period - 1)) + loss) / period;

    result.push(
      calculateRSIValue(averageGain, averageLoss)
    );
  }

  return result;
}

function calculateRSIValue(
  averageGain: number,
  averageLoss: number
): number {
  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;

  return 100 - (100 / (1 + relativeStrength));
}