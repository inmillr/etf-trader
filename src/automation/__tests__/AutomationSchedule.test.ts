import { describe, expect, test } from "vitest";

import {
  isJobDue,
  nextScheduledRun
} from "../AutomationSchedule.js";

describe("AutomationSchedule", () => {
  test("nextScheduledRun returns a future weekday time", () => {
    const from = new Date("2026-08-13T20:00:00.000Z");
    const next = nextScheduledRun(
      {
        signalTimeEt: "16:05",
        tradeTimeEt: "09:35",
        timezone: "America/New_York"
      },
      "signal",
      from
    );

    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(
      from.getTime()
    );
  });

  test("isJobDue skips weekends", () => {
    const saturday = new Date(
      "2026-08-15T16:10:00.000Z"
    );

    expect(
      isJobDue(
        {
          signalTimeEt: "16:05",
          tradeTimeEt: "09:35",
          timezone: "America/New_York"
        },
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
        {
          signalTimeEt: "16:05",
          tradeTimeEt: "09:35",
          timezone: "America/New_York"
        },
        "signal",
        null,
        thursdayAfternoon
      )
    ).toBe(true);

    expect(
      isJobDue(
        {
          signalTimeEt: "16:05",
          tradeTimeEt: "09:35",
          timezone: "America/New_York"
        },
        "signal",
        "2026-08-13",
        thursdayAfternoon
      )
    ).toBe(false);
  });
});
