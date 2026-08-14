import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { DEFAULT_AUTOMATION_SCHEDULE } from "../AutomationTypes.js";
import { loadAutomationState } from "../AutomationStore.js";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("AutomationStore schedule migration", () => {
  test("replaces next-morning 09:35 trades with same-afternoon 15:55", () => {
    const dir = mkdtempSync(
      path.join(tmpdir(), "automation-state-")
    );
    tmpDirs.push(dir);
    const filePath = path.join(
      dir,
      "automation-state.json"
    );

    writeFileSync(
      filePath,
      JSON.stringify({
        enabled: true,
        schedule: {
          backfillTimeEt: "16:00",
          signalTimeEt: "16:05",
          tradeTimeEt: "09:35",
          timezone: "America/New_York"
        }
      })
    );

    const state = loadAutomationState(filePath);

    expect(state.schedule).toEqual(
      DEFAULT_AUTOMATION_SCHEDULE
    );
    expect(state.enabled).toBe(true);
  });
});
