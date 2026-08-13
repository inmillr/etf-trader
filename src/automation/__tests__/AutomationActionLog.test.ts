import { describe, expect, test } from "vitest";

import {
  buildSignalActionLog
} from "../AutomationActionLog.js";

describe("AutomationActionLog", () => {
  test("buildSignalActionLog describes signal-only flow", () => {
    const log = buildSignalActionLog(
      { symbol: "XLE", since: "2026-08-10" },
      {
        success: true,
        message: "ROTATE — Rotate XLE → XLK.",
        signal: {
          strategy: "aggressive",
          signalDate: "2026-08-12",
          selectionAsOfDate: "2026-08-11",
          action: "rotate",
          targetSymbol: "XLK",
          heldSymbol: "XLE",
          rawPick: "XLK",
          isRebalanceDay: true,
          absoluteMomentumPassed: true,
          usingFallback: false,
          fallbackSymbol: null,
          rotationBlocked: false,
          rankings: [],
          reason: "Rotate XLE → XLK."
        }
      }
    );

    expect(log[0]).toContain("Run Signal Now");
    expect(log.join("\n")).toContain(
      "Updated data/signal-state.json → XLK"
    );
    expect(log.join("\n")).toContain(
      "No Alpaca orders submitted"
    );
  });
});
