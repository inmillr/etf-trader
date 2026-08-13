import { AlpacaMarketDataProvider } from "../data/providers/AlpacaMarketDataProvider.js";
import { MarketDataService } from "../data/MarketDataService.js";
import { HistoricalDataService } from "../data/HistoricalDataService.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import type { Timeframe } from "../types/market.js";

const [
  ,
  ,
  symbolsArgument,
  timeframe,
  startString,
  endString
] = process.argv;

if (
  !symbolsArgument ||
  !timeframe ||
  !startString ||
  !endString
) {
  console.error(
    "Usage: npm run backfill -- SYMBOL[,SYMBOL...] TIMEFRAME START END"
  );

  process.exit(1);
}

const symbols = symbolsArgument
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);

if (symbols.length === 0) {
  console.error("At least one symbol is required.");

  process.exit(1);
}

const start = new Date(startString);
const end = new Date(endString);

if (
  Number.isNaN(start.getTime()) ||
  Number.isNaN(end.getTime())
) {
  console.error(
    "Start and end must be valid dates."
  );

  process.exit(1);
}

if (start >= end) {
  console.error(
    "Start date must be before end date."
  );

  process.exit(1);
}

const apiKey =
  process.env.ALPACA_API_KEY;

const apiSecret =
  process.env.ALPACA_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error(
    "ALPACA_API_KEY and ALPACA_API_SECRET must be set."
  );

  process.exit(1);
}

const repository =
  new SQLiteCandleRepository(
    "data/market.db"
  );

try {
  const provider =
    new AlpacaMarketDataProvider({
      apiKey,
      apiSecret,
      tradingBaseUrl:
        "https://paper-api.alpaca.markets/v2",
      marketDataBaseUrl:
        "https://data.alpaca.markets",
      paper: true
    });

  const marketDataService =
    new MarketDataService(
      provider,
      repository
    );

  const historicalDataService =
    new HistoricalDataService(
      marketDataService,
      {
        chunkDays: 7
      }
    );

  console.log(
    `Backfilling ${symbols.join(", ")} ${timeframe}`
  );

  console.log(
    `${start.toISOString()} → ${end.toISOString()}`
  );

  for (const symbol of symbols) {
    console.log("");
    console.log(`=== ${symbol} ===`);

    const totalFetched =
      await historicalDataService.fetchRange({
        symbol,
        timeframe: timeframe as Timeframe,
        start,
        end
      });

    const stored =
      await repository.getCandles({
        symbol,
        timeframe: timeframe as Timeframe,
        start,
        end
      });

    console.log(
      `Fetched ${totalFetched} new candles.`
    );

    console.log(
      `Database contains ${stored.length} candles for the requested range.`
    );
  }
} finally {
  repository.close();
}