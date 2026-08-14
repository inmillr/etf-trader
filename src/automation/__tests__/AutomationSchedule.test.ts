import { describe, expect, test } from "vitest";

import {
  isJobDue,
  nextScheduledRun
} from "../AutomationSchedule.js";

const SCHEDULE = {
  backfillTimeEt: "15:50",
  signalTimeEt: "15:55",
  tradeTimeEt: "15:55",
  timezone: "America/New_York"
};

describe("AutomationSchedule", () => {
  test("nextScheduledRun returns a future weekday time", () => {
    const from = new Date("2026-08-13T20:00:00.000Z");
    const next = nextScheduledRun(
      SCHEDULE,
      "signal",
      from
    );

    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(
      from.getTime()
    );
  });

  test("backfill is scheduled before signal on the same day", () => {
    const from = new Date("2026-08-13T14:00:00.000Z");

    const backfill = nextScheduledRun(
      SCHEDULE,
      "backfill",
      from
    );
    const signal = nextScheduledRun(
      SCHEDULE,
      "signal",
      from
    );

    expect(backfill).not.toBeNull();
    expect(signal).not.toBeNull();
    expect(backfill!.getTime()).toBeLessThan(
      signal!.getTime()
    );
  });

  test("isJobDue skips weekends", () => {
    const saturday = new Date(
      "2026-08-15T16:10:00.000Z"
    );

    expect(
      isJobDue(
        SCHEDULE,
        "signal",
        null,
        saturday
      )
    ).toBe(false);
  });

  test("isJobDue runs once per day after scheduled time", () => {
    const thursdayAfternoon = new Date(
      "2026-08-13T20:10:00.000Z"
    );

    expect(
      isJobDue(
        SCHEDULE,
        "signal",
        null,
        thursdayAfternoon
      )
    ).toBe(true);

    expect(
      isJobDue(
        SCHEDULE,
        "signal",
        "2026-08-13",
        thursdayAfternoon
      )
    ).toBe(false);
  });

  test("isJobDue runs backfill at its scheduled time", () => {
    const thursdayBeforeSignal = new Date(
      "2026-08-13T19:52:00.000Z"
    );

    expect(
      isJobDue(
        SCHEDULE,
        "backfill",
        null,
        thursdayBeforeSignal
      )
    ).toBe(true);

    expect(
      isJobDue(
        SCHEDULE,
        "signal",
        null,
        thursdayBeforeSignal
      )
    ).toBe(false);
  });

  test("signal and trade are due together before the close", () => {
    const thursdayBeforeClose = new Date(
      "2026-08-13T19:56:00.000Z"
    );

    expect(
      isJobDue(
        SCHEDULE,
        "signal",
        null,
        thursdayBeforeClose
      )
    ).toBe(true);

    expect(
      isJobDue(
        SCHEDULE,
        "trade",
        null,
        thursdayBeforeClose
      )
    ).toBe(true);
  });

  test("next trade is the same afternoon, not the next morning", () => {
    const thursdayMorning = new Date(
      "2026-08-13T14:00:00.000Z"
    );

    const trade = nextScheduledRun(
      SCHEDULE,
      "trade",
      thursdayMorning
    );
    const signal = nextScheduledRun(
      SCHEDULE,
      "signal",
      thursdayMorning
    );

    expect(trade).not.toBeNull();
    expect(signal).not.toBeNull();
    expect(trade!.getTime()).toBe(
      signal!.getTime()
    );

    const etHour = new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "America/New_York",
        hour: "2-digit",
        hour12: false
      }
    ).format(trade!);

    expect(Number(etHour)).toBe(15);
  });
});
