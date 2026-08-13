import { getAlpacaConfig } from "../config/AlpacaConfig.js";
import { AlpacaMarketDataProvider } from "../data/providers/AlpacaMarketDataProvider.js";
import { MarketDataService } from "../data/MarketDataService.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";

const config = getAlpacaConfig();

const provider =
  new AlpacaMarketDataProvider(config);

const repository =
  new SQLiteCandleRepository("./data/trading.db");

const service =
  new MarketDataService(
    provider,
    repository
  );

const request = {
  symbol: "QQQ",
  timeframe: "5m" as const,
  start: new Date("2026-08-07T14:00:00Z"),
  end: new Date("2026-08-07T15:00:00Z")
};

console.log("First fetch...");

const first =
  await service.fetchAndStore(request);

console.log(
  `First fetch returned ${first.length} candles.`
);

console.log("Second fetch...");

const second =
  await service.fetchAndStore(request);

console.log(
  `Second fetch returned ${second.length} candles.`
);

const stored =
  await service.getStoredCandles(request);

console.log(
  `SQLite contains ${stored.length} candles.`
);