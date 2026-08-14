import {
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

import type {
  AutomationJob,
  AutomationJobRun,
  AutomationRunLogEntry,
  AutomationSchedule,
  AutomationState,
  AutomationTrigger
} from "./AutomationTypes.js";
import { DEFAULT_AUTOMATION_SCHEDULE } from "./AutomationTypes.js";

const DEFAULT_STATE: AutomationState = {
  enabled: false,
  schedule: {
    ...DEFAULT_AUTOMATION_SCHEDULE
  },
  daemon: {
    pid: null,
    startedAt: null,
    lastHeartbeat: null
  },
  lastRuns: {
    backfill: null,
    signal: null,
    trade: null
  },
  runLog: [],
  lastActionLog: null
};

export function resolveAutomationStatePath(): string {
  return (
    process.env.AUTOMATION_STATE_PATH ??
    "./data/automation-state.json"
  );
}

export function loadAutomationState(
  path = resolveAutomationStatePath()
): AutomationState {
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8")
    ) as Partial<AutomationState>;

    return {
      ...DEFAULT_STATE,
      ...parsed,
      schedule: migrateSchedule({
        ...DEFAULT_STATE.schedule,
        ...parsed.schedule
      }),
      daemon: {
        ...DEFAULT_STATE.daemon,
        ...parsed.daemon
      },
      lastRuns: {
        backfill:
          parsed.lastRuns?.backfill ?? null,
        signal:
          parsed.lastRuns?.signal ?? null,
        trade:
          parsed.lastRuns?.trade ?? null
      },
      runLog: parsed.runLog ?? [],
      lastActionLog:
        parsed.lastActionLog ?? null
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveAutomationState(
  state: AutomationState,
  path = resolveAutomationStatePath()
): void {
  mkdirSync(dirname(path), { recursive: true });

  writeFileSync(
    path,
    `${JSON.stringify(state, null, 2)}\n`
  );
}

export function isProcessAlive(
  pid: number | null
): boolean {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function appendRunLog(
  state: AutomationState,
  entry: Omit<
    AutomationRunLogEntry,
    "id" | "at"
  >
): AutomationState {
  const nextEntry: AutomationRunLogEntry = {
    id: `${Date.now()}-${entry.job}`,
    at: new Date().toISOString(),
    ...entry
  };

  const runLog = [
    nextEntry,
    ...state.runLog
  ].slice(0, 50);

  return {
    ...state,
    runLog
  };
}

export function recordJobRun(
  state: AutomationState,
  job: AutomationJob,
  trigger: AutomationTrigger,
  result: {
    success: boolean;
    message: string;
    mode?: AutomationJobRun["mode"];
    signalDate?: string;
  }
): AutomationState {
  const now = new Date();
  const day = formatEtDay(now);
  const run: AutomationJobRun = {
    at: now.toISOString(),
    day,
    success: result.success,
    message: result.message,
    ...(result.mode ? { mode: result.mode } : {}),
    ...(result.signalDate
      ? { signalDate: result.signalDate }
      : {})
  };

  let nextState = appendRunLog(state, {
    job,
    trigger,
    success: result.success,
    message: result.message
  });

  if (job === "signal") {
    nextState = {
      ...nextState,
      lastRuns: {
        ...nextState.lastRuns,
        signal: run
      }
    };
  } else if (job === "backfill") {
    nextState = {
      ...nextState,
      lastRuns: {
        ...nextState.lastRuns,
        backfill: run
      }
    };
  } else {
    nextState = {
      ...nextState,
      lastRuns: {
        ...nextState.lastRuns,
        trade: run
      }
    };
  }

  return nextState;
}

function formatEtDay(date: Date): string {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(date);
}

export { formatEtDay };

function migrateSchedule(
  schedule: AutomationSchedule
): AutomationSchedule {
  if (schedule.tradeTimeEt === "09:35") {
    return {
      ...DEFAULT_AUTOMATION_SCHEDULE
    };
  }

  return schedule;
}
