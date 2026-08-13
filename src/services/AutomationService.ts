import { spawn } from "node:child_process";
import path from "node:path";

import {
  buildBackfillActionLog,
  buildControlActionLog,
  buildSignalActionLog,
  buildTradeActionLog
} from "../automation/AutomationActionLog.js";
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
import {
  AlpacaTradingClient
} from "../broker/AlpacaTradingClient.js";
import {
  PaperTradingRunner
} from "../broker/PaperTradingRunner.js";
import {
  loadSignalState
} from "../broker/SignalStateStore.js";
import {
  assessSignalFreshness
} from "../automation/SignalFreshness.js";
import { getAlpacaConfig } from "../config/AlpacaConfig.js";
import {
  getTradingConfig
} from "../config/TradingConfig.js";
import {
  StrategyDashboardService
} from "./StrategyDashboardService.js";
import {
  MarketDataBackfillRunner
} from "../data/MarketDataBackfillRunner.js";

export class AutomationService {
  private readonly statePath =
    process.env.AUTOMATION_STATE_PATH ??
    "./data/automation-state.json";

  private readonly runner =
    new PaperTradingRunner();

  private readonly dashboard =
    new StrategyDashboardService();

  private readonly backfillRunner =
    new MarketDataBackfillRunner();

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
      lastActionLog: state.lastActionLog,
      env: {
        paperTradingEnabled:
          tradingConfig.paperTradingEnabled,
        alpacaPaper: alpacaConfig.paper,
        allowLiveTrading:
          tradingConfig.allowLiveTrading
      },
      market: null,
      signalFreshness: null
    };
  }

  async getStatusWithMarket(): Promise<AutomationStatusResponse> {
    const state = loadAutomationState(
      this.statePath
    );
    const status = this.getStatus();
    const latestDataDate =
      await this.dashboard.getLatestDataDate();

    let market: AutomationStatusResponse["market"] =
      null;

    try {
      const client = new AlpacaTradingClient(
        getAlpacaConfig()
      );

      const clock = await client.getClock();

      market = {
        isOpen: clock.is_open,
        nextOpen: clock.next_open,
        nextClose: clock.next_close
      };
    } catch {
      market = status.market;
    }

    const signalFreshness =
      assessSignalFreshness({
        latestDataDate,
        lastSignalRun: state.lastRuns.signal,
        lastBackfillRun: state.lastRuns.backfill,
        lastTradeRun: state.lastRuns.trade,
        marketOpen: market?.isOpen ?? null,
        tradeTimeEt: state.schedule.tradeTimeEt
      });

    return {
      ...status,
      market,
      signalFreshness
    };
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

  async runManualAction(
    action: string
  ): Promise<
    AutomationStatusResponse & {
      actionLog: string[];
      success: boolean;
      message: string;
    }
  > {
    switch (action) {
      case "enable": {
        this.setEnabled(true);

        return {
          ...(await this.getStatusWithMarket()),
          actionLog: buildControlActionLog(
            action,
            "Scheduled jobs will run when the scheduler is on."
          ),
          success: true,
          message: "Automation enabled"
        };
      }

      case "disable": {
        this.setEnabled(false);

        return {
          ...(await this.getStatusWithMarket()),
          actionLog: buildControlActionLog(
            action,
            "Scheduled jobs paused until turned on again."
          ),
          success: true,
          message: "Automation disabled"
        };
      }

      case "start-daemon": {
        this.startDaemon();

        return {
          ...(await this.getStatusWithMarket()),
          actionLog: buildControlActionLog(
            action,
            "Background scheduler process started."
          ),
          success: true,
          message: "Scheduler started"
        };
      }

      case "stop-daemon": {
        this.stopDaemon();

        return {
          ...(await this.getStatusWithMarket()),
          actionLog: buildControlActionLog(
            action,
            "Background scheduler process stopped."
          ),
          success: true,
          message: "Scheduler stopped"
        };
      }

      case "run-backfill": {
        spawnAutomationJob("backfill");

        return {
          ...(await this.getStatusWithMarket()),
          actionLog: [
            "▶ Update Market Data",
            "Backfill started in the background.",
            "This usually takes 1–2 minutes — please wait."
          ],
          success: true,
          message: "Backfill started"
        };
      }

      case "run-signal":
      case "run-trade-dry":
      case "run-trade-execute": {
        const job: AutomationJob =
          action === "run-signal"
            ? "signal"
            : action === "run-trade-dry"
              ? "trade-dry"
              : "trade-execute";

        if (job === "trade-execute") {
          const freshness =
            await this.getStatusWithMarket();

          if (
            freshness.signalFreshness?.isStale
          ) {
            return {
              ...freshness,
              actionLog: [
                "▶ Execute Trade (override)",
                freshness.signalFreshness
                  .staleReason ??
                  "Signal is stale.",
                freshness.signalFreshness
                  ?.needsBackfill
                  ? "Update Market Data, then Run Signal Now."
                  : "Run Signal Now first, then execute if you still want to trade early."
              ],
              success: false,
              message:
                "Blocked — signal is stale"
            };
          }
        }

        const detailed =
          await this.runJobDetailed(
            job,
            "manual"
          );

        let log = detailed.log;

        if (
          job === "trade-dry" ||
          job === "trade-execute"
        ) {
          const freshness =
            await this.getStatusWithMarket();

          if (
            freshness.signalFreshness?.isStale &&
            job === "trade-dry"
          ) {
            log = [
              "⚠ Signal is stale — preview uses the last computed pick.",
              freshness.signalFreshness
                .staleReason ?? "",
              "",
              ...log
            ];
          }

          if (
            freshness.signalFreshness
              ?.canManualExecute &&
            job === "trade-execute"
          ) {
            log = [
              freshness.signalFreshness
                .manualExecuteHint ?? "",
              "",
              ...log
            ];
          }
        }

        return {
          ...(await this.getStatusWithMarket()),
          actionLog: log,
          success: detailed.success,
          message: detailed.message
        };
      }

      default:
        throw new Error(
          `Unknown automation action: ${action}`
        );
    }
  }

  async runJobDetailed(
    job: AutomationJob,
    trigger: AutomationTrigger = "manual"
  ): Promise<{
    success: boolean;
    message: string;
    log: string[];
  }> {
    const state = loadAutomationState(
      this.statePath
    );

    const tradingConfig = getTradingConfig();
    const priorState = loadSignalState(
      tradingConfig.signalStatePath
    );

    let result: {
      success: boolean;
      message: string;
      mode?: "dry-run" | "execute" | "offline";
      signalDate?: string;
    };

    let log: string[] = [];

    switch (job) {
      case "backfill": {
        const backfillResult =
          await this.backfillRunner.runDailyUpdate();

        log = buildBackfillActionLog(
          backfillResult
        );

        result = {
          success: backfillResult.success,
          message: backfillResult.message
        };
        break;
      }

      case "signal": {
        const signalResult =
          await this.runner.runSignal();

        log = buildSignalActionLog(
          priorState,
          signalResult
        );

        result = {
          success: signalResult.success,
          message: signalResult.message,
          signalDate:
            signalResult.signal?.signalDate
        };
        break;
      }

      case "trade-dry": {
        const tradeResult =
          await this.runner.runPaperTrade({
            execute: false
          });

        log = buildTradeActionLog(
          tradeResult,
          "Preview Trade"
        );

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

        log = buildTradeActionLog(
          tradeResult,
          "Execute Trade"
        );

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
      {
        ...nextState,
        lastActionLog: {
          at: new Date().toISOString(),
          job,
          success: result.success,
          log
        }
      },
      this.statePath
    );

    return {
      success: result.success,
      message: result.message,
      log
    };
  }

  async runJob(
    job: AutomationJob,
    trigger: AutomationTrigger = "manual"
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const detailed = await this.runJobDetailed(
      job,
      trigger
    );

    return {
      success: detailed.success,
      message: detailed.message
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
