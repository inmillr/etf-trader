import { describe, expect, test } from "vitest";
import {
  DEFAULT_ETF_UNIVERSE,
  filterLiquidCandidates,
  LIQUID_ETF_SYMBOLS,
  LIQUID_ETF_UNIVERSE
} from "../EtfUniverse.js";

describe("EtfUniverse liquid-only", () => {
  test("liquid universe contains only broad market ETFs", () => {
    expect(LIQUID_ETF_SYMBOLS).toEqual([
      "SPY",
      "QQQ",
      "IWM",
      "DIA"
    ]);

    expect(LIQUID_ETF_UNIVERSE).toHaveLength(4);

    for (const candidate of LIQUID_ETF_UNIVERSE) {
      expect(candidate.category).toBe("broad");
    }
  });

  test("filterLiquidCandidates removes thematic and sector picks", () => {
    const filtered = filterLiquidCandidates(
      DEFAULT_ETF_UNIVERSE
    );

    expect(filtered).toHaveLength(4);
    expect(
      filtered.map((candidate) => candidate.symbol)
    ).toEqual([
      "SPY",
      "QQQ",
      "IWM",
      "DIA"
    ]);
  });
});
