import { AlpacaMarketDataProvider } from "../data/providers/AlpacaMarketDataProvider.js";
import { MarketDataService } from "../data/MarketDataService.js";
import { HistoricalDataService } from "../data/HistoricalDataService.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import {
  DEFAULT_ETF_UNIVERSE,
  StaticUniverseProvider
} from "../universe/EtfUniverse.js";
import type { Timeframe } from "../types/market.js";

const [
  ,
  ,
  timeframeArg,
  startString,
  endString
] = process.argv;

const timeframe = (timeframeArg ?? "1d") as Timeframe;

const end = endString
  ? new Date(endString)
  : new Date();

const start = startString
  ? new Date(startString)
  : new Date(end);

if (!startString) {
  start.setUTCDate(
    start.getUTCDate() - 90
  );
}

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

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

const repository =
  new SQLiteCandleRepository(
    databasePath
  );

try {
  const provider =
    new StaticUniverseProvider();

  const candidates =
    await provider.getCandidates();

  const symbols = candidates.map(
    (candidate) => candidate.symbol
  );

  const alpacaProvider =
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
      alpacaProvider,
      repository
    );

  const historicalDataService =
    new HistoricalDataService(
      marketDataService,
      {
        chunkDays: 30
      }
    );

  console.log(
    `Backfilling ${symbols.length} ETFs ` +
    `from ${DEFAULT_ETF_UNIVERSE.length}-symbol universe`
  );

  console.log(
    `${timeframe}  ${start.toISOString().slice(0, 10)} → ` +
    `${end.toISOString().slice(0, 10)}`
  );

  for (const symbol of symbols) {
    console.log("");
    console.log(`=== ${symbol} ===`);

    const totalFetched =
      await historicalDataService.fetchRange({
        symbol,
        timeframe,
        start,
        end
      });

    const stored =
      await repository.getCandles({
        symbol,
        timeframe,
        start,
        end
      });

    console.log(
      `Fetched ${totalFetched} new candles.`
    );

    console.log(
      `Database contains ${stored.length} candles ` +
      `for the requested range.`
    );
  }
} finally {
  repository.close();
}
