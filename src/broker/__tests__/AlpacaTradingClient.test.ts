import {
  afterEach,
  describe,
  expect,
  test,
  vi
} from "vitest";

import {
  AlpacaTradingClient,
  AlpacaTradingError
} from "../AlpacaTradingClient.js";

const config = {
  apiKey: "test-key",
  apiSecret: "test-secret",
  tradingBaseUrl:
    "https://paper-api.alpaca.markets/v2",
  marketDataBaseUrl:
    "https://data.alpaca.markets",
  paper: true
};

describe("AlpacaTradingClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("getAccount sends Alpaca auth headers", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "acct-1",
        status: "ACTIVE",
        currency: "USD",
        buying_power: "10000",
        cash: "10000",
        portfolio_value: "10000",
        equity: "10000",
        pattern_day_trader: false,
        trading_blocked: false,
        account_blocked: false
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new AlpacaTradingClient(
      config,
      fetchMock
    );

    const account = await client.getAccount();

    expect(account.buying_power).toBe("10000");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://paper-api.alpaca.markets/v2/account",
      expect.objectContaining({
        headers: expect.objectContaining({
          "APCA-API-KEY-ID": "test-key",
          "APCA-API-SECRET-KEY": "test-secret"
        })
      })
    );
  });

  test("createOrder posts market order payload", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "order-1",
        client_order_id: "client-1",
        status: "accepted",
        symbol: "SPY",
        qty: "10",
        filled_qty: "0",
        side: "buy",
        type: "market",
        submitted_at: "2026-08-13T20:00:00Z",
        filled_at: null
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new AlpacaTradingClient(
      config,
      fetchMock
    );

    const order = await client.createOrder({
      symbol: "SPY",
      qty: "10",
      side: "buy",
      type: "market",
      time_in_force: "day"
    });

    expect(order.symbol).toBe("SPY");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      symbol: "SPY",
      qty: "10",
      side: "buy",
      type: "market",
      time_in_force: "day"
    });
  });

  test("throws AlpacaTradingError on HTTP failure", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("unauthorized", {
        status: 401,
        statusText: "Unauthorized"
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new AlpacaTradingClient(
      config,
      fetchMock
    );

    await expect(client.getAccount()).rejects.toBeInstanceOf(
      AlpacaTradingError
    );
  });
});
