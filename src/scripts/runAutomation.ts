import "dotenv/config";

import {
  isProcessAlive,
  loadAutomationState,
  saveAutomationState
} from "../automation/AutomationStore.js";
import {
  AutomationService
} from "../services/AutomationService.js";

const POLL_MS = Number(
  process.env.AUTOMATION_POLL_MS ?? 60_000
);

const statePath =
  process.env.AUTOMATION_STATE_PATH ??
  "./data/automation-state.json";

const service = new AutomationService();

function cleanup(): void {
  service.clearDaemon(process.pid);

  const state = loadAutomationState(statePath);

  if (state.daemon.pid === process.pid) {
    saveAutomationState(
      {
        ...state,
        daemon: {
          pid: null,
          startedAt: null,
          lastHeartbeat: null
        }
      },
      statePath
    );
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

const existing = loadAutomationState(statePath);

if (
  isProcessAlive(existing.daemon.pid) &&
  existing.daemon.pid !== process.pid
) {
  console.error(
    `Automation daemon already running (pid ${existing.daemon.pid}).`
  );
  process.exit(1);
}

service.registerDaemon(process.pid);

console.log("=== ETF Trader Automation ===");
console.log(`PID:          ${process.pid}`);
console.log(
  `Poll interval: ${POLL_MS / 1000}s`
);
console.log(
  "Schedule (ET): backfill 16:00 · signal 16:05 · trade 09:35"
);
console.log(
  "Control:       enable in UI or set enabled in data/automation-state.json"
);
console.log("");

while (true) {
  service.heartbeatDaemon(process.pid);

  const state = loadAutomationState(statePath);

  if (state.enabled) {
    const result = await service.tick();

    if (result.ran.length > 0) {
      console.log(
        `[${new Date().toISOString()}] Ran: ${result.ran.join(", ")}`
      );
    }
  }

  await sleep(POLL_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
