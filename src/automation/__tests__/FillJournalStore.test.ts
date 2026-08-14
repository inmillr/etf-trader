import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import type { PaperTradeRunResult } from "../../broker/PaperTradingRunner.js";
import {
  entriesFromTrade,
  loadFillJournal,
  resolvePendingNextCloses,
  saveFillJournal,
  slippageBps
} from "../FillJournalStore.js";
import type { FillJournalEntry } from "../AutomationTypes.js";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function journalPath(): string {
  const dir = mkdtempSync(
    path.join(tmpdir(), "fill-journal-")
  );
  tmpDirs.push(dir);
  return path.join(dir, "fill-journal.json");
}

function rotateResult(
  overrides: Partial<PaperTradeRunResult> = {}
): PaperTradeRunResult {
  return {
    success: true,
    message: "Dry run — 2 planned order(s)",
    mode: "dry-run",
    referencePrice: 50,
    plan: {
      signalAction: "rotate",
      signalReason: "Rotate XLK → SMH.",
      targetSymbol: "SMH",
      brokerSymbol: "XLK",
      brokerQty: 10,
      noTrade: false,
      steps: [
        {
          side: "sell",
          symbol: "XLK",
          qty: 10,
          reason: "Rotate out."
        },
        {
          side: "buy",
          symbol: "SMH",
          qty: 8,
          reason: "Rotate in."
        }
      ]
    },
    ...overrides
  };
}

describe("FillJournalStore", () => {
  test("slippageBps is null without prices", () => {
    expect(slippageBps(null, 10)).toBeNull();
    expect(slippageBps(100, 101)).toBeCloseTo(100);
  });

  test("entriesFromTrade skips holds", () => {
    const entries = entriesFromTrade(
      {
        success: true,
        message: "No trade",
        mode: "dry-run",
        plan: {
          signalAction: "hold",
          signalReason: "Keep holding SMH.",
          targetSymbol: "SMH",
          brokerSymbol: "SMH",
          brokerQty: 5,
          noTrade: true,
          noTradeReason: "HOLD",
          steps: []
        }
      },
      "scheduled",
      {}
    );

    expect(entries).toEqual([]);
  });

  test("entriesFromTrade records each planned step", () => {
    const entries = entriesFromTrade(
      rotateResult({
        orders: [
          {
            id: "1",
            client_order_id: "1",
            status: "filled",
            symbol: "SMH",
            qty: "8",
            filled_qty: "8",
            filled_avg_price: "51.25",
            side: "buy",
            type: "market",
            submitted_at: "2026-08-13T19:55:00.000Z",
            filled_at: "2026-08-13T19:55:01.000Z"
          }
        ],
        mode: "execute",
        message: "Submitted 1 order(s)"
      }),
      "scheduled",
      { XLK: 90, SMH: 50 }
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      side: "sell",
      symbol: "XLK",
      backtestPrice: 90,
      alpacaFillPrice: null
    });
    expect(entries[1]).toMatchObject({
      side: "buy",
      symbol: "SMH",
      backtestPrice: 50,
      alpacaFillPrice: 51.25
    });
  });

  test("resolvePendingNextCloses fills the next session close", async () => {
    const filePath = journalPath();
    const pending: FillJournalEntry[] = [
      {
        id: "1",
        at: "2026-08-13T19:55:00.000Z",
        day: "2026-08-13",
        trigger: "scheduled",
        mode: "dry-run",
        signalAction: "buy",
        side: "buy",
        symbol: "SMH",
        qty: 2,
        backtestPrice: 100,
        alpacaFillPrice: null,
        nextClose: null,
        nextCloseDate: null
      }
    ];

    saveFillJournal(pending, filePath);

    await resolvePendingNextCloses(
      async (symbol, afterDay) => {
        expect(symbol).toBe("SMH");
        expect(afterDay).toBe("2026-08-13");
        return { date: "2026-08-14", close: 102.5 };
      },
      filePath
    );

    const loaded = loadFillJournal(filePath);
    expect(loaded[0]?.nextClose).toBe(102.5);
    expect(loaded[0]?.nextCloseDate).toBe(
      "2026-08-14"
    );
  });
});
