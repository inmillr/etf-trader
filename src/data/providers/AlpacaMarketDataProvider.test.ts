import { afterEach, describe, expect, test, vi } from "vitest";
import { AlpacaMarketDataProvider } from "./AlpacaMarketDataProvider.js";

const config = {
  apiKey: "test-key",
  apiSecret: "test-secret",
  tradingBaseUrl: "https://paper-api.alpaca.markets/v2",
  marketDataBaseUrl: "https://data.alpaca.markets",
  paper: true
};

const request = {
  symbol: "QQQ",
  timeframe: "5m" as const,
  start: new Date("2026-08-07T14:00:00Z"),
  end: new Date("2026-08-07T15:00:00Z")
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AlpacaMarketDataProvider", () => {
  test("maps Alpaca bars to Candle objects", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            bars: [
              {
                t: "2026-08-07T14:00:00Z",
                o: 500,
                h: 502,
                l: 499,
                c: 501,
                v: 100000
              },
              {
                t: "2026-08-07T14:05:00Z",
                o: 501,
                h: 503,
                l: 500,
                c: 502,
                v: 120000
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );

    const provider =
      new AlpacaMarketDataProvider(config);

    const candles =
      await provider.getHistoricalCandles(request);

    expect(candles).toEqual([
      {
        symbol: "QQQ",
        timeframe: "5m",
        timestamp: new Date("2026-08-07T14:00:00Z"),
        open: 500,
        high: 502,
        low: 499,
        close: 501,
        volume: 100000
      },
      {
        symbol: "QQQ",
        timeframe: "5m",
        timestamp: new Date("2026-08-07T14:05:00Z"),
        open: 501,
        high: 503,
        low: 500,
        close: 502,
        volume: 120000
      }
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();

    const call = fetchMock.mock.calls[0];

    expect(call).toBeDefined();

    const [url, options] = call!;

    expect(String(url)).toContain(
      "/v2/stocks/QQQ/bars"
    );

    expect(String(url)).toContain(
      "timeframe=5Min"
    );

    expect(options?.headers).toEqual({
      "APCA-API-KEY-ID": "test-key",
      "APCA-API-SECRET-KEY": "test-secret"
    });
  });

  test(
    "returns an empty array when Alpaca returns no bars",
    async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              bars: []
            }),
            {
              status: 200
            }
          )
        );

      const provider =
        new AlpacaMarketDataProvider(config);

      const candles =
        await provider.getHistoricalCandles(request);

      expect(candles).toEqual([]);
    }
  );

  test(
    "throws when Alpaca returns an error",
    async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              message: "Unauthorized"
            }),
            {
              status: 401,
              statusText: "Unauthorized"
            }
          )
        );

      const provider =
        new AlpacaMarketDataProvider(config);

      await expect(
        provider.getHistoricalCandles(request)
      ).rejects.toThrow(
        "Alpaca market data request failed: 401 Unauthorized"
      );
    }
  );
});
