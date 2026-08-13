import { validateHistoricalDataRequest } from "./data/MarketDataValidation.js";

const validRequest = {
  symbol: "QQQ",
  timeframe: "5m" as const,
  start: new Date("2026-08-07T14:00:00Z"),
  end: new Date("2026-08-07T15:00:00Z")
};

validateHistoricalDataRequest(validRequest);

console.log("Valid request passed.");