import { describe, expect, test } from "vitest";
import {
  countDaysHeld,
  resolveActiveSymbols
} from "../RotationPolicy.js";

describe("RotationPolicy", () => {
  test("keeps current symbol when hold period not met", () => {
    const selection = {
      asOfDate: new Date("2026-02-10T00:00:00Z"),
      selectedSymbols: ["SOXX"],
      scores: [
        { symbol: "SOXX", score: 40 },
        { symbol: "QQQ", score: 30 }
      ]
    };

    const active = resolveActiveSymbols(
      selection,
      "QQQ",
      3,
      {
        minHoldDays: 5,
        minScoreImprovement: 5
      }
    );

    expect(active).toEqual(["QQQ"]);
  });

  test("rotates when score improvement exceeds threshold", () => {
    const selection = {
      asOfDate: new Date("2026-02-10T00:00:00Z"),
      selectedSymbols: ["SOXX"],
      scores: [
        { symbol: "SOXX", score: 45 },
        { symbol: "QQQ", score: 30 }
      ]
    };

    const active = resolveActiveSymbols(
      selection,
      "QQQ",
      7,
      {
        minHoldDays: 5,
        minScoreImprovement: 5
      }
    );

    expect(active).toEqual(["SOXX"]);
  });

  test("counts calendar days held", () => {
    expect(
      countDaysHeld(
        "2026-02-01",
        "2026-02-06"
      )
    ).toBe(5);
  });
});
