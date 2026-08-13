import { spawn } from "node:child_process";
import path from "node:path";

import {
  AlpacaTradingClient
} from "../broker/AlpacaTradingClient.js";
import {
  PaperTradingRunner
} from "../broker/PaperTradingRunner.js";
import {
  isJobDue,
  nextScheduledRun
} from "../automation/AutomationSchedule.js";
import {
  isProcessAlive,
  loadAutomationState,
  recordJobRun,
  saveAutomationState
} from "../automation/AutomationStore.js";
import type {
  AutomationJob,
  AutomationStatusResponse,
  AutomationTrigger
} from "../automation/AutomationTypes.js";
import { getAlpacaConfig } from "../config/AlpacaConfig.js";
import {
  getTradingConfig
} from "../config/TradingConfig.js";

export class AutomationService {
  private readonly statePath =
    process.env.AUTOMATION_STATE_PATH ??
    "./data/automation-state.json";

  private readonly runner =
    new PaperTradingRunner();

  getStatus(): AutomationStatusResponse {
    const state = loadAutomationState(
      this.statePath
    );

    const tradingConfig = getTradingConfig();
    const alpacaConfig = getAlpacaConfig();

    const daemonRunning =
      isProcessAlive(state.daemon.pid);

    return {
      enabled: state.enabled,
      daemonRunning,
      daemon: {
        ...state.daemon,
        pid: daemonRunning
          ? state.daemon.pid
          : null
      },
      schedule: state.schedule,
      nextRuns: {
        signal: nextScheduledRun(
          state.schedule,
          "signal"
        )?.toISOString() ?? null,
        trade: nextScheduledRun(
          state.schedule,
          "trade"
        )?.toISOString() ?? null
      },
      lastRuns: state.lastRuns,
      runLog: state.runLog.slice(0, 20),
      env: {
        paperTradingEnabled:
          tradingConfig.paperTradingEnabled,
        alpacaPaper: alpacaConfig.paper,
        allowLiveTrading:
          tradingConfig.allowLiveTrading
      },
      market: null
    };
  }

  async getStatusWithMarket(): Promise<AutomationStatusResponse> {
    const status = this.getStatus();

    try {
      const client = new AlpacaTradingClient(
        getAlpacaConfig()
      );

      const clock = await client.getClock();

      return {
        ...status,
        market: {
          isOpen: clock.is_open,
          nextOpen: clock.next_open,
          nextClose: clock.next_close
        }
      };
    } catch {
      return status;
    }
  }

  setEnabled(enabled: boolean): AutomationStatusResponse {
    const state = loadAutomationState(
      this.statePath
    );

    saveAutomationState(
      {
        ...state,
        enabled
      },
      this.statePath
    );

    return this.getStatus();
  }

  registerDaemon(
    pid: number
  ): AutomationStatusResponse {
    const state = loadAutomationState(
      this.statePath
    );

    const now = new Date().toISOString();

    saveAutomationState(
      {
        ...state,
        daemon: {
          pid,
          startedAt: now,
          lastHeartbeat: now
        }
      },
      this.statePath
    );

    return this.getStatus();
  }

  heartbeatDaemon(
    pid: number
  ): void {
    const state = loadAutomationState(
      this.statePath
    );

    if (state.daemon.pid !== pid) {
      return;
    }

    saveAutomationState(
      {
        ...state,
        daemon: {
          ...state.daemon,
          lastHeartbeat: new Date().toISOString()
        }
      },
      this.statePath
    );
  }

  clearDaemon(
    pid: number
  ): void {
    const state = loadAutomationState(
      this.statePath
    );

    if (state.daemon.pid !== pid) {
      return;
    }

    saveAutomationState(
      {
        ...state,
        daemon: {
          pid: null,
          startedAt: null,
          lastHeartbeat: null
        }
      },
      this.statePath
    );
  }

  async runJob(
    job: AutomationJob,
    trigger: AutomationTrigger = "manual"
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const state = loadAutomationState(
      this.statePath
    );

    let result: {
      success: boolean;
      message: string;
      mode?: "dry-run" | "execute" | "offline";
    };

    switch (job) {
      case "signal": {
        const signalResult =
          await this.runner.runSignal();

        result = {
          success: signalResult.success,
          message: signalResult.message
        };
        break;
      }

      case "trade-dry": {
        const tradeResult =
          await this.runner.runPaperTrade({
            execute: false
          });

        result = {
          success: tradeResult.success,
          message: tradeResult.message,
          mode: tradeResult.mode
        };
        break;
      }

      case "trade-execute": {
        const tradeResult =
          await this.runner.runPaperTrade({
            execute: true
          });

        result = {
          success: tradeResult.success,
          message: tradeResult.message,
          mode: tradeResult.mode
        };
        break;
      }
    }

    const nextState = recordJobRun(
      state,
      job,
      trigger,
      result
    );

    saveAutomationState(
      nextState,
      this.statePath
    );

    return {
      success: result.success,
      message: result.message
    };
  }

  async tick(): Promise<{
    ran: AutomationJob[];
    skippedReason?: string;
  }> {
    const state = loadAutomationState(
      this.statePath
    );

    if (!state.enabled) {
      return {
        ran: [],
        skippedReason: "Automation disabled"
      };
    }

    const ran: AutomationJob[] = [];

    if (
      isJobDue(
        state.schedule,
        "signal",
        state.lastRuns.signal?.day ?? null
      )
    ) {
      await this.runJob("signal", "scheduled");
      ran.push("signal");
    }

    const tradingConfig = getTradingConfig();
    const tradeJob: AutomationJob =
      tradingConfig.paperTradingEnabled
        ? "trade-execute"
        : "trade-dry";

    if (
      isJobDue(
        state.schedule,
        "trade",
        state.lastRuns.trade?.day ?? null
      )
    ) {
      await this.runJob(
        tradeJob,
        "scheduled"
      );
      ran.push(tradeJob);
    }

    return { ran };
  }

  startDaemon(): AutomationStatusResponse {
    const status = this.getStatus();

    if (status.daemonRunning) {
      return status;
    }

    const projectRoot =
      process.env.PROJECT_ROOT ??
      process.cwd();

    const child = spawn(
      process.execPath,
      [
        "--import=tsx",
        path.join(
          projectRoot,
          "src/scripts/runAutomation.ts"
        )
      ],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          PROJECT_ROOT: projectRoot
        },
        detached: true,
        stdio: "ignore"
      }
    );

    child.unref();

    return this.getStatus();
  }

  stopDaemon(): AutomationStatusResponse {
    const state = loadAutomationState(
      this.statePath
    );

    if (
      state.daemon.pid &&
      isProcessAlive(state.daemon.pid)
    ) {
      process.kill(state.daemon.pid, "SIGTERM");
    }

    saveAutomationState(
      {
        ...state,
        daemon: {
          pid: null,
          startedAt: null,
          lastHeartbeat: null
        }
      },
      this.statePath
    );

    return this.getStatus();
  }
}

export function spawnAutomationJob(
  job: AutomationJob
): void {
  const projectRoot =
    process.env.PROJECT_ROOT ??
    process.cwd();

  const child = spawn(
    process.execPath,
    [
      "--import=tsx",
      path.join(
        projectRoot,
        "src/scripts/automationJob.ts"
      ),
      job,
      "--trigger",
      "manual"
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PROJECT_ROOT: projectRoot
      },
      detached: true,
      stdio: "ignore"
    }
  );

  child.unref();
}
