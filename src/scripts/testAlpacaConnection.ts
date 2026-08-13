import { getAlpacaConfig } from "../config/AlpacaConfig.js";
import { AlpacaMarketDataProvider } from "../data/providers/AlpacaMarketDataProvider.js";

const config = getAlpacaConfig();

const provider =
  new AlpacaMarketDataProvider(config);

const candles =
  await provider.getHistoricalCandles({
    symbol: "QQQ",
    timeframe: "5m",
    start: new Date("2026-08-07T14:00:00Z"),
    end: new Date("2026-08-07T15:00:00Z")
  });

console.log(`Received ${candles.length} candles.`);

console.dir(candles.slice(0, 5), {
  depth: null
});