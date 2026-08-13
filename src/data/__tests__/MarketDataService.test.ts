import { describe, expect, test, vi } from "vitest";
import { MarketDataService } from "../MarketDataService.js";
import type { Candle } from "../../types/market.js";
import type { MarketDataProvider } from "../MarketData.js";
import type { CandleRepository } from "../CandleRepository.js";

const candle: Candle = {
  symbol: "QQQ",
  timeframe: "5m",
  timestamp: new Date("2026-08-07T14:00:00Z"),
  open: 500,
  high: 502,
  low: 499,
  close: 501,
  volume: 100_000
};

function createProvider(): MarketDataProvider {
  return {
    getHistoricalCandles: vi.fn()
      .mockResolvedValue([candle])
  };
}

function createRepository(
  storedCandles: Candle[] = []
): CandleRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),

    getCandles: vi.fn()
      .mockResolvedValue(storedCandles),

    getCoverage: vi.fn().mockResolvedValue({
      earliest: null,
      latest: null,
      count: 0
    }),

    getTimestamps: vi.fn().mockResolvedValue([])
  };
}

describe("MarketDataService", () => {
  test("fetches and stores valid market data", async () => {
    const provider = createProvider();
    const repository = createRepository();

    const service =
      new MarketDataService(provider, repository);

    const request = {
      symbol: "QQQ",
      timeframe: "5m" as const,
      start: new Date("2026-08-07T14:00:00Z"),
      end: new Date("2026-08-07T15:00:00Z")
    };

    const result =
      await service.fetchAndStore(request);

    expect(result).toEqual([candle]);

    expect(
      provider.getHistoricalCandles
    ).toHaveBeenCalledOnce();

    expect(repository.save).toHaveBeenCalledWith([
      candle
    ]);
  });

  test("rejects invalid requests before calling provider", async () => {
    const provider = createProvider();
    const repository = createRepository();

    const service =
      new MarketDataService(provider, repository);

    const request = {
      symbol: "",
      timeframe: "5m" as const,
      start: new Date("2026-08-07T14:00:00Z"),
      end: new Date("2026-08-07T15:00:00Z")
    };

    await expect(
      service.fetchAndStore(request)
    ).rejects.toThrow("Symbol cannot be empty.");

    expect(
      provider.getHistoricalCandles
    ).not.toHaveBeenCalled();

    expect(repository.save).not.toHaveBeenCalled();
  });

  test("returns stored candles", async () => {
    const provider = createProvider();
const repository = createRepository([candle]);

    const service =
      new MarketDataService(provider, repository);

    const request = {
      symbol: "QQQ",
      timeframe: "5m" as const,
      start: new Date("2026-08-07T14:00:00Z"),
      end: new Date("2026-08-07T15:00:00Z")
    };

    const result =
      await service.getStoredCandles(request);

    expect(result).toEqual([candle]);

    expect(
      repository.getCandles
    ).toHaveBeenCalledWith(request);
  });
});