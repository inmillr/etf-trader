import type { Candle } from "../../types/market.js";
import type { HistoricalDataRequest, MarketDataProvider } from "../MarketData.js";
import type { AlpacaConfig } from "../../config/AlpacaConfig.js";

export class AlpacaMarketDataProvider implements MarketDataProvider {
  constructor(
    private readonly config: AlpacaConfig
  ) {}

  async getHistoricalCandles(
    request: HistoricalDataRequest
  ): Promise<Candle[]> {
    const timeframe = this.mapTimeframe(request.timeframe);

    const url = new URL(
      `${this.config.marketDataBaseUrl}/v2/stocks/${encodeURIComponent(request.symbol)}/bars`
    );

    url.searchParams.set("timeframe", timeframe);
    url.searchParams.set("start", request.start.toISOString());
    url.searchParams.set("end", request.end.toISOString());
    url.searchParams.set("limit", "10000");
    url.searchParams.set("adjustment", "raw");
    url.searchParams.set("feed", "iex");
    url.searchParams.set("sort", "asc");

    const response = await fetchWithRetry(url, {
      headers: {
        "APCA-API-KEY-ID": this.config.apiKey,
        "APCA-API-SECRET-KEY": this.config.apiSecret
      }
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Alpaca market data request failed: ${response.status} ${response.statusText} - ${body}`
      );
    }

    const data = await response.json() as {
      bars?: Array<{
        t: string;
        o: number;
        h: number;
        l: number;
        c: number;
        v: number;
      }>;
    };

    return (data.bars ?? []).map((bar) => ({
      symbol: request.symbol,
      timeframe: request.timeframe,
      timestamp: new Date(bar.t),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v
    }));
  }

  private mapTimeframe(
    timeframe: HistoricalDataRequest["timeframe"]
  ): string {
    switch (timeframe) {
      case "1m":
        return "1Min";

      case "5m":
        return "5Min";

      case "15m":
        return "15Min";

      case "30m":
        return "30Min";

      case "1h":
        return "1Hour";

      case "1d":
        return "1Day";
    }
  }
}

async function fetchWithRetry(
  url: URL,
  init: RequestInit,
  maxAttempts = 5
): Promise<Response> {
  let delayMs = 1000;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    const response = await fetch(url, init);

    if (
      response.status !== 429 ||
      attempt === maxAttempts
    ) {
      return response;
    }

    await sleep(delayMs);
    delayMs *= 2;
  }

  throw new Error(
    "Alpaca market data request exhausted retries."
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}