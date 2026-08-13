import { describe, expect, test } from "vitest";
import { validateHistoricalDataRequest } from "../MarketDataValidation.js";

describe("validateHistoricalDataRequest", () => {
  test("accepts a valid request", () => {
    expect(() =>
      validateHistoricalDataRequest({
        symbol: "QQQ",
        timeframe: "5m",
        start: new Date("2026-08-07T14:00:00Z"),
        end: new Date("2026-08-07T15:00:00Z")
      })
    ).not.toThrow();
  });

  test("rejects an empty symbol", () => {
    expect(() =>
      validateHistoricalDataRequest({
        symbol: "",
        timeframe: "5m",
        start: new Date("2026-08-07T14:00:00Z"),
        end: new Date("2026-08-07T15:00:00Z")
      })
    ).toThrow("Symbol cannot be empty.");
  });

  test("rejects an invalid start date", () => {
    expect(() =>
      validateHistoricalDataRequest({
        symbol: "QQQ",
        timeframe: "5m",
        start: new Date("invalid"),
        end: new Date("2026-08-07T15:00:00Z")
      })
    ).toThrow("Start date is invalid.");
  });

  test("rejects an invalid end date", () => {
    expect(() =>
      validateHistoricalDataRequest({
        symbol: "QQQ",
        timeframe: "5m",
        start: new Date("2026-08-07T14:00:00Z"),
        end: new Date("invalid")
      })
    ).toThrow("End date is invalid.");
  });

  test("rejects start after end", () => {
    expect(() =>
      validateHistoricalDataRequest({
        symbol: "QQQ",
        timeframe: "5m",
        start: new Date("2026-08-07T15:00:00Z"),
        end: new Date("2026-08-07T14:00:00Z")
      })
    ).toThrow("Start date must be before end date.");
  });

  test("rejects start equal to end", () => {
    const date = new Date("2026-08-07T14:00:00Z");

    expect(() =>
      validateHistoricalDataRequest({
        symbol: "QQQ",
        timeframe: "5m",
        start: date,
        end: date
      })
    ).toThrow("Start date must be before end date.");
  });
});