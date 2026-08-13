import { describe, expect, test } from "vitest";

import {
  buildPaperTradePlan,
  calculateBuyQty,
  resolveBrokerHoldings
} from "../PaperTradingService.js";

describe("PaperTradingService", () => {
  test("resolveBrokerHoldings returns flat when no positions", () => {
    expect(resolveBrokerHoldings([])).toEqual({
      symbol: null,
      qty: 0
    });
  });

  test("calculateBuyQty reserves cash buffer", () => {
    expect(
      calculateBuyQty(10_000, 100, 0.01)
    ).toBe(99);
  });

  test("buildPaperTradePlan skips hold signals", () => {
    const plan = buildPaperTradePlan(
      {
        action: "hold",
        targetSymbol: "XLE",
        reason: "Keep holding XLE."
      },
      { buying_power: "5000" },
      { symbol: "XLE", qty: 10 },
      90,
      { cashReservePercent: 0.01 }
    );

    expect(plan.noTrade).toBe(true);
    expect(plan.steps).toHaveLength(0);
  });

  test("buildPaperTradePlan sells on exit when holding", () => {
    const plan = buildPaperTradePlan(
      {
        action: "exit",
        targetSymbol: null,
        reason: "Exit to cash."
      },
      { buying_power: "5000" },
      { symbol: "XLE", qty: 12 },
      null,
      { cashReservePercent: 0.01 }
    );

    expect(plan.noTrade).toBe(false);
    expect(plan.steps).toEqual([
      {
        side: "sell",
        symbol: "XLE",
        qty: 12,
        reason: "Exit signal — close position."
      }
    ]);
  });

  test("buildPaperTradePlan rotates out then in", () => {
    const plan = buildPaperTradePlan(
      {
        action: "rotate",
        targetSymbol: "XLF",
        reason: "Rotate XLE → XLF."
      },
      { buying_power: "10000" },
      { symbol: "XLE", qty: 20 },
      50,
      { cashReservePercent: 0.01 }
    );

    expect(plan.steps).toEqual([
      {
        side: "sell",
        symbol: "XLE",
        qty: 20,
        reason: "Rotate out of XLE."
      },
      {
        side: "buy",
        symbol: "XLF",
        qty: 198,
        reason: "Rotate into XLF."
      }
    ]);
  });

  test("buildPaperTradePlan skips when already at target", () => {
    const plan = buildPaperTradePlan(
      {
        action: "buy",
        targetSymbol: "SPY",
        reason: "Enter SPY."
      },
      { buying_power: "5000" },
      { symbol: "SPY", qty: 5 },
      500,
      { cashReservePercent: 0.01 }
    );

    expect(plan.noTrade).toBe(true);
    expect(plan.noTradeReason).toContain("Already holding");
  });
});
