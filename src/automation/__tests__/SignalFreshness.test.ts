import { describe, expect, test } from "vitest";

import {
  assessSignalFreshness
} from "../SignalFreshness.js";

describe("SignalFreshness", () => {
  test("marks signal stale when SQLite has newer data", () => {
    const result = assessSignalFreshness({
      latestDataDate: "2026-08-12",
      lastSignalRun: {
        at: "2026-08-13T20:00:00.000Z",
        day: "2026-08-13",
        success: true,
        message: "HOLD",
        signalDate: "2026-08-11"
      },
      lastBackfillRun: null,
      lastTradeRun: null,
      marketOpen: true,
      tradeTimeEt: "15:55"
    });

    expect(result.isStale).toBe(true);
    expect(result.canManualExecute).toBe(false);
    expect(result.staleReason).toContain(
      "2026-08-12"
    );
  });

  test("allows manual execute when signal matches latest data and market is open", () => {
    const result = assessSignalFreshness({
      latestDataDate: "2026-08-12",
      lastSignalRun: {
        at: "2026-08-13T21:00:00.000Z",
        day: "2026-08-13",
        success: true,
        message: "HOLD",
        signalDate: "2026-08-12"
      },
      lastBackfillRun: {
        at: "2026-08-13T21:00:00.000Z",
        day: "2026-08-13",
        success: true,
        message: "Downloaded 0 new daily bar(s)"
      },
      lastTradeRun: null,
      marketOpen: true,
      tradeTimeEt: "15:55",
      now: new Date("2026-08-13T15:00:00.000Z")
    });

    expect(result.isStale).toBe(false);
    expect(result.canManualExecute).toBe(true);
    expect(result.manualExecuteHint).toContain(
      "15:55"
    );
  });
});
