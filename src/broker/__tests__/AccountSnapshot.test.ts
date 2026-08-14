import { describe, expect, test } from "vitest";

import {
  buildAccountSnapshot
} from "../AccountSnapshot.js";
import type {
  AlpacaAccount,
  AlpacaPosition
} from "../AlpacaTradingTypes.js";

const account: AlpacaAccount = {
  id: "acct-1",
  status: "ACTIVE",
  currency: "USD",
  buying_power: "400000",
  cash: "25000",
  portfolio_value: "105000",
  equity: "105000",
  pattern_day_trader: false,
  trading_blocked: false,
  account_blocked: false
};

const positions: AlpacaPosition[] = [
  {
    symbol: "SMH",
    qty: "100",
    side: "long",
    market_value: "80000",
    avg_entry_price: "750",
    current_price: "800"
  }
];

describe("buildAccountSnapshot", () => {
  test("computes cash, invested, and total balances", () => {
    const snapshot = buildAccountSnapshot(
      account,
      positions,
      "paper",
      "/tmp/missing-signal-state.json"
    );

    expect(snapshot.cash).toBe(25000);
    expect(snapshot.invested).toBe(80000);
    expect(snapshot.total).toBe(105000);
    expect(snapshot.buyingPower).toBe(400000);
    expect(snapshot.brokerSymbol).toBe("SMH");
    expect(snapshot.brokerQty).toBe(100);
    expect(snapshot.positions).toHaveLength(1);
  });

  test("marks flat broker as aligned with missing strategy state", () => {
    const snapshot = buildAccountSnapshot(
      {
        ...account,
        cash: "100000",
        equity: "100000",
        portfolio_value: "100000"
      },
      [],
      "paper",
      "/tmp/missing-signal-state.json"
    );

    expect(snapshot.invested).toBe(0);
    expect(snapshot.brokerSymbol).toBeNull();
    expect(snapshot.alignedWithStrategy).toBe(true);
  });
});
