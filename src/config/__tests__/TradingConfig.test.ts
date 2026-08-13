import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from "vitest";

import { getAlpacaConfig } from "../AlpacaConfig.js";
import {
  assertExecutionAllowed,
  getTradingConfig
} from "../TradingConfig.js";

describe("TradingConfig", () => {
  const originalEnabled =
    process.env.PAPER_TRADING_ENABLED;
  const originalAllowLive =
    process.env.ALPACA_ALLOW_LIVE;
  const originalPaper =
    process.env.ALPACA_PAPER;
  const originalKey =
    process.env.ALPACA_API_KEY;
  const originalSecret =
    process.env.ALPACA_API_SECRET;

  beforeEach(() => {
    process.env.ALPACA_API_KEY = "test-key";
    process.env.ALPACA_API_SECRET = "test-secret";
    process.env.ALPACA_PAPER = "true";
    delete process.env.PAPER_TRADING_ENABLED;
    delete process.env.ALPACA_ALLOW_LIVE;
  });

  afterEach(() => {
    process.env.PAPER_TRADING_ENABLED =
      originalEnabled;
    process.env.ALPACA_ALLOW_LIVE =
      originalAllowLive;
    process.env.ALPACA_PAPER = originalPaper;
    process.env.ALPACA_API_KEY = originalKey;
    process.env.ALPACA_API_SECRET =
      originalSecret;
  });

  test("defaults execution to disabled", () => {
    const config = getTradingConfig();

    expect(config.paperTradingEnabled).toBe(false);
    expect(config.allowLiveTrading).toBe(false);
    expect(config.cashReservePercent).toBe(0.01);
  });

  test("assertExecutionAllowed requires explicit enable flag", () => {
    process.env.PAPER_TRADING_ENABLED = "true";

    expect(() =>
      assertExecutionAllowed(
        getAlpacaConfig(),
        getTradingConfig()
      )
    ).not.toThrow();
  });

  test("assertExecutionAllowed blocks live trading by default", () => {
    process.env.ALPACA_PAPER = "false";
    process.env.PAPER_TRADING_ENABLED = "true";

    expect(() =>
      assertExecutionAllowed(
        getAlpacaConfig(),
        getTradingConfig()
      )
    ).toThrow("Live trading is blocked");
  });
});
