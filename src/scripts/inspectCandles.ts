import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";

const repository =
  new SQLiteCandleRepository("./data/trading.db");

const candles =
  await repository.getCandles({
    symbol: "QQQ",
    timeframe: "5m",
    start: new Date("2026-08-07T00:00:00Z"),
    end: new Date("2026-08-08T00:00:00Z")
  });

console.log(`Total candles: ${candles.length}`);

if (candles.length === 0) {
  throw new Error("No candles found.");
}

const firstCandle = candles[0];
const lastCandle = candles[candles.length - 1];

if (!firstCandle || !lastCandle) {
  throw new Error("Unable to access candle data.");
}

const timestamps =
  candles.map(
    candle => candle.timestamp.getTime()
  );

const uniqueTimestamps =
  new Set(timestamps);

console.log(
  `Unique timestamps: ${uniqueTimestamps.size}`
);

console.log(
  `First timestamp: ${firstCandle.timestamp.toISOString()}`
);

console.log(
  `Last timestamp: ${lastCandle.timestamp.toISOString()}`
);

console.log(
  `Chronological: ${
    timestamps.every(
      (timestamp, index) =>
        index === 0 ||
        timestamp >= timestamps[index - 1]!
    )
  }`
);

console.log("First candle:");
console.dir(firstCandle, {
  depth: null
});

console.log("Last candle:");
console.dir(lastCandle, {
  depth: null
});