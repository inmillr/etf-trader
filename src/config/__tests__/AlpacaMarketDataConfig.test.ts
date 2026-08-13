import { afterEach, describe, expect, test } from "vitest";
import { getAlpacaMarketDataConfig } from "../AlpacaMarketDataConfig.js";

describe("AlpacaMarketDataConfig", () => {
  afterEach(() => {
    delete process.env.ALPACA_API_KEY;
    delete process.env.ALPACA_API_SECRET;
  });

  test("returns market data credentials only", () => {
    process.env.ALPACA_API_KEY = "test-key";
    process.env.ALPACA_API_SECRET = "test-secret";

    const config =
      getAlpacaMarketDataConfig();

    expect(config.apiKey).toBe("test-key");
    expect(config.apiSecret).toBe("test-secret");
    expect(config.marketDataBaseUrl).toBe(
      "https://data.alpaca.markets"
    );
  });

  test("throws when credentials are missing", () => {
    expect(() =>
      getAlpacaMarketDataConfig()
    ).toThrow(
      "ALPACA_API_KEY environment variable is not set."
    );
  });
});
