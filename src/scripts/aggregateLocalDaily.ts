import "dotenv/config";

import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import { aggregateToDailyCandles } from "../market/DailyCandleAggregator.js";
import type { Timeframe } from "../types/market.js";

const sourceTimeframe = (
  process.argv[2] ?? "5m"
) as Timeframe;

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

const repository =
  new SQLiteCandleRepository(
    databasePath
  );

try {
  const symbols = repository.listSymbols(
    sourceTimeframe
  );

  if (symbols.length === 0) {
    console.log(
      `No ${sourceTimeframe} candles found in ${databasePath}.`
    );

    process.exit(0);
  }

  console.log(
    `Aggregating ${sourceTimeframe} → 1d for ` +
    `${symbols.length} symbols (local, no API)...`
  );

  for (const symbol of symbols) {
    const coverage =
      await repository.getCoverage(
        symbol,
        sourceTimeframe
      );

    if (
      !coverage.earliest ||
      !coverage.latest
    ) {
      continue;
    }

    const intraday =
      await repository.getCandles({
        symbol,
        timeframe: sourceTimeframe,
        start: coverage.earliest,
        end: coverage.latest
      });

    const daily =
      aggregateToDailyCandles(intraday);

    await repository.save(daily);

    console.log(
      `${symbol.padEnd(6)}  ` +
      `${intraday.length} ${sourceTimeframe} bars → ` +
      `${daily.length} daily bars`
    );
  }

  console.log("");
  console.log(
    "Done. Run `npm run backtest:adaptive` to backtest " +
    "using stored daily candles."
  );
} finally {
  repository.close();
}
