import type { Candle } from "../types/market.js";

function dayKey(timestamp: Date): string {
  return timestamp.toISOString().slice(0, 10);
}

export function aggregateToDailyCandles(
  candles: Candle[]
): Candle[] {
  const sorted = [...candles].sort(
    (a, b) =>
      a.timestamp.getTime() -
      b.timestamp.getTime()
  );

  const grouped = new Map<string, Candle[]>();

  for (const candle of sorted) {
    const key = dayKey(candle.timestamp);
    const bucket = grouped.get(key) ?? [];

    bucket.push(candle);
    grouped.set(key, bucket);
  }

  const daily: Candle[] = [];

  for (const [key, bucket] of grouped.entries()) {
    const first = bucket[0]!;
    const last = bucket[bucket.length - 1]!;

    daily.push({
      symbol: first.symbol,
      timeframe: "1d",
      timestamp: new Date(`${key}T00:00:00.000Z`),
      open: first.open,
      high: Math.max(
        ...bucket.map(
          (candle) => candle.high
        )
      ),
      low: Math.min(
        ...bucket.map(
          (candle) => candle.low
        )
      ),
      close: last.close,
      volume: bucket.reduce(
        (sum, candle) =>
          sum + candle.volume,
        0
      )
    });
  }

  return daily.sort(
    (a, b) =>
      a.timestamp.getTime() -
      b.timestamp.getTime()
  );
}
