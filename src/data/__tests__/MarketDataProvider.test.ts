import { describe, expect, test } from "vitest";
import type {
  HistoricalDataRequest,
  MarketDataProvider
} from "../MarketData.js";
import type { Candle } from "../../types/market.js";

function assertValidCandles(
  candles: Candle[],
  request: HistoricalDataRequest
): void {
  for (const candle of candles) {
    expect(candle.symbol).toBe(request.symbol);
    expect(candle.timeframe).toBe(request.timeframe);

    expect(candle.timestamp).toBeInstanceOf(Date);

    expect(Number.isFinite(candle.open)).toBe(true);
    expect(Number.isFinite(candle.high)).toBe(true);
    expect(Number.isFinite(candle.low)).toBe(true);
    expect(Number.isFinite(candle.close)).toBe(true);
    expect(Number.isFinite(candle.volume)).toBe(true);

    expect(candle.high).toBeGreaterThanOrEqual(candle.low);
  }
}

describe("MarketDataProvider contract", () => {
  test("returned candles match the requested market data", async () => {
    const provider: MarketDataProvider = {
      async getHistoricalCandles(request) {
        return [
          {
            symbol: request.symbol,
            timeframe: request.timeframe,
            timestamp: new Date("2026-08-07T14:00:00Z"),
            open: 500,
            high: 502,
            low: 499,
            close: 501,
            volume: 100_000
          }
        ];
      }
    };

    const request: HistoricalDataRequest = {
      symbol: "QQQ",
      timeframe: "5m",
      start: new Date("2026-08-07T14:00:00Z"),
      end: new Date("2026-08-07T15:00:00Z")
    };

    const candles =
      await provider.getHistoricalCandles(request);

    assertValidCandles(candles, request);
  });
});