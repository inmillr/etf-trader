import { describe, expect, test } from "vitest";
import {
  DEFAULT_INITIAL_CASH,
  DEFAULT_PORTFOLIO
} from "../PortfolioConfig.js";

describe("PortfolioConfig", () => {
  test("defaults to $1,000 initial cash", () => {
    expect(DEFAULT_INITIAL_CASH).toBe(1_000);
    expect(DEFAULT_PORTFOLIO.initialCash).toBe(1_000);
  });
});
