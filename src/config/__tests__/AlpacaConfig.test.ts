import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { getAlpacaConfig } from "../AlpacaConfig.js";

describe("getAlpacaConfig", () => {
  const originalKey = process.env.ALPACA_API_KEY;
  const originalSecret = process.env.ALPACA_API_SECRET;
  const originalPaper = process.env.ALPACA_PAPER;

  beforeEach(() => {
    process.env.ALPACA_API_KEY = "test-key";
    process.env.ALPACA_API_SECRET = "test-secret";
    process.env.ALPACA_PAPER = "true";
  });

  afterEach(() => {
    process.env.ALPACA_API_KEY = originalKey;
    process.env.ALPACA_API_SECRET = originalSecret;
    process.env.ALPACA_PAPER = originalPaper;
  });

  test("returns paper trading configuration", () => {
    const config = getAlpacaConfig();

    expect(config.apiKey).toBe("test-key");
    expect(config.apiSecret).toBe("test-secret");
    expect(config.paper).toBe(true);

    expect(config.tradingBaseUrl)
      .toBe("https://paper-api.alpaca.markets/v2");

    expect(config.marketDataBaseUrl)
      .toBe("https://data.alpaca.markets");
  });

  test("defaults to paper trading", () => {
    delete process.env.ALPACA_PAPER;

    const config = getAlpacaConfig();

    expect(config.paper).toBe(true);
  });

  test("rejects missing API key", () => {
    delete process.env.ALPACA_API_KEY;

    expect(() => getAlpacaConfig())
      .toThrow(
        "ALPACA_API_KEY environment variable is not set."
      );
  });

  test("rejects missing API secret", () => {
    delete process.env.ALPACA_API_SECRET;

    expect(() => getAlpacaConfig())
      .toThrow(
        "ALPACA_API_SECRET environment variable is not set."
      );
  });
});