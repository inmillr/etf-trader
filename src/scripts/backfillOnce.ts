import "dotenv/config";

import { getAlpacaMarketDataConfig } from "../config/AlpacaMarketDataConfig.js";
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
    start.getUTCDate() - 365
  );
}

if (
  Number.isNaN(start.getTime()) ||
  Number.isNaN(start.getTime())
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

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

const repository =
  new SQLiteCandleRepository(
    databasePath
  );

try {
  const credentials =
    getAlpacaMarketDataConfig();

  const provider =
    new StaticUniverseProvider();

  const candidates =
    await provider.getCandidates();

  const symbols = candidates.map(
    (candidate) => candidate.symbol
  );

  const alpacaProvider =
    new AlpacaMarketDataProvider({
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      tradingBaseUrl: "",
      marketDataBaseUrl:
        credentials.marketDataBaseUrl,
      paper: true
    });

  const marketDataService =
    new MarketDataService(
      alpacaProvider,
      repository
    );

  const chunkDays =
    timeframe === "1m"
      ? 3
      : timeframe === "5m"
        ? 7
        : 30;

  const historicalDataService =
    new HistoricalDataService(
      marketDataService,
      {
        chunkDays
      }
    );

  console.log(
    "=== One-time market data backfill ==="
  );
  console.log(
    "Uses Alpaca MARKET DATA API only (historical bars)."
  );
  console.log(
    "No orders, no positions, no trading endpoints."
  );
  console.log(
    "Re-runs skip candles already in SQLite."
  );
  console.log("");
  console.log(
    `Universe:  ${symbols.length} ETFs`
  );
  console.log(
    `Timeframe: ${timeframe}`
  );
  console.log(
    `Range:     ${start.toISOString().slice(0, 10)} → ` +
    `${end.toISOString().slice(0, 10)}`
  );
  console.log(
    `Chunk size:  ${chunkDays} days`
  );

  let totalNewCandles = 0;
  let symbolsUpdated = 0;

  for (const symbol of symbols) {
    console.log("");
    console.log(`=== ${symbol} ===`);

    const beforeCount =
      (
        await repository.getCandles({
          symbol,
          timeframe,
          start,
          end
        })
      ).length;

    const fetched =
      await historicalDataService.fetchRange({
        symbol,
        timeframe,
        start,
        end
      });

    const afterCount =
      (
        await repository.getCandles({
          symbol,
          timeframe,
          start,
          end
        })
      ).length;

    console.log(
      `New candles fetched: ${fetched}`
    );

    console.log(
      `Stored in range:     ${afterCount} ` +
      `(was ${beforeCount})`
    );

    if (fetched > 0) {
      symbolsUpdated++;
    }

    totalNewCandles += fetched;

    await sleep(
      timeframe === "5m" ? 2500 : 1500
    );
  }

  console.log("");
  console.log(
    "=== Backfill complete ==="
  );
  console.log(
    `Symbols updated: ${symbolsUpdated}/${symbols.length}`
  );
  console.log(
    `New candles:     ${totalNewCandles}`
  );
  console.log("");
  console.log(
    "Next steps (no API calls):"
  );
  console.log(
    "  npm run backtest:intraday"
  );
  console.log(
    "  npm run backtest:adaptive"
  );

  if (timeframe === "5m") {
    console.log(
      "  npm run aggregate:daily   # optional daily rollup from 5m"
    );
  } else if (timeframe !== "1d") {
    console.log(
      "  npm run aggregate:daily   # if you fetched intraday bars"
    );
  }

  console.log("");
  console.log(
    "You can remove ALPACA_* from .env after this " +
    "if you only use local SQLite from here on."
  );
} catch (error) {
  if (
    error instanceof Error &&
    error.message.includes("ALPACA_API")
  ) {
    console.error("");
    console.error(
      "Add Alpaca credentials to .env, then run once:"
    );
    console.error(
      "  cp .env.example .env"
    );
    console.error(
      "  npm run backfill:once"
    );
  }

  throw error;
} finally {
  repository.close();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
