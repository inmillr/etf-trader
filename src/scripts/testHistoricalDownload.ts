import { getAlpacaConfig } from "../config/AlpacaConfig.js";
import { AlpacaMarketDataProvider } from "../data/providers/AlpacaMarketDataProvider.js";
import { HistoricalDataService } from "../data/HistoricalDataService.js";
import { MarketDataService } from "../data/MarketDataService.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";

const config = getAlpacaConfig();

const provider =
  new AlpacaMarketDataProvider(config);

const repository =
  new SQLiteCandleRepository("./data/trading.db");

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

const start =
  new Date("2026-08-07T14:00:00Z");

const end =
  new Date("2026-08-07T21:00:00Z");

console.log(
  `Downloading QQQ 5m data from ${start.toISOString()} to ${end.toISOString()}...`
);

const fetched =
  await historicalDataService.fetchRange({
    symbol: "QQQ",
    timeframe: "5m",
    start,
    end
  });

console.log(
  `Fetched ${fetched} candles.`
);

const stored =
  await marketDataService.getStoredCandles({
    symbol: "QQQ",
    timeframe: "5m",
    start,
    end
  });

console.log(
  `SQLite contains ${stored.length} candles.`
);

console.log("First candle:");
console.dir(stored[0], {
  depth: null
});

console.log("Last candle:");
console.dir(
  stored[stored.length - 1],
  {
    depth: null
  }
);