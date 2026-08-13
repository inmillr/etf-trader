"use client";

import { useCallback, useEffect, useState } from "react";

import { ActionButton } from "@/components/ActionButton";
import { ActionLogModal } from "@/components/ActionLogModal";
import type {
  AutomationControlResponse,
  AutomationStatusResponse
} from "@/types/dashboard";

function formatTimestamp(
  value: string | null | undefined
): string {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString(
    "en-US",
    { timeZone: "America/New_York" }
  );
}

function statusBadge(
  enabled: boolean,
  daemonRunning: boolean
): {
  label: string;
  className: string;
} {
  if (enabled && daemonRunning) {
    return {
      label: "Running",
      className: "badge badge-buy"
    };
  }

  if (enabled && !daemonRunning) {
    return {
      label: "Enabled · daemon stopped",
      className: "badge badge-rotate"
    };
  }

  return {
    label: "Off",
    className: "badge badge-cash"
  };
}

interface ActionModalState {
  title: string;
  lines: string[];
  success: boolean;
}

const RUNNING_LABELS: Record<string, string> = {
  "run-backfill": "Updating market data…",
  "run-signal": "Running signal…",
  "run-trade-dry": "Previewing trade…",
  "run-trade-execute": "Executing trade…",
  "start-daemon": "Starting scheduler…",
  "stop-daemon": "Stopping scheduler…",
  enable: "Turning on…",
  disable: "Turning off…"
};

interface WorkflowStepProps {
  step: number;
  title: string;
  when: string;
  does: string;
  action: string;
  buttonLabel: string;
  runningAction: string | null;
  disabled?: boolean;
  disabledReason?: string;
  highlight?: boolean;
  variant?: "default" | "danger";
  onRun: (action: string) => void;
}

function WorkflowStep({
  step,
  title,
  when,
  does,
  action,
  buttonLabel,
  runningAction,
  disabled = false,
  disabledReason,
  highlight = false,
  variant = "default",
  onRun
}: WorkflowStepProps) {
  const buttonClass =
    variant === "danger"
      ? "btn btn-danger"
      : highlight
        ? "btn btn-primary"
        : "btn";

  return (
    <div
      className={`workflow-step${
        highlight ? " workflow-step-highlight" : ""
      }`}
    >
      <div className="workflow-step-number">
        {step}
      </div>
      <div className="workflow-step-body">
        <h3>{title}</h3>
        <p>
          <strong>When:</strong> {when}
        </p>
        <p>
          <strong>Does:</strong> {does}
        </p>
        <ActionButton
          action={action}
          runningAction={runningAction}
          label={buttonLabel}
          runningLabel={
            RUNNING_LABELS[action] ??
            "Working…"
          }
          className={buttonClass}
          disabled={disabled}
          disabledReason={disabledReason}
          onRun={onRun}
        />
      </div>
    </div>
  );
}

export function AutomationPanel() {
  const [status, setStatus] =
    useState<AutomationStatusResponse | null>(
      null
    );
  const [error, setError] = useState<
    string | null
  >(null);
  const [runningAction, setRunningAction] =
    useState<string | null>(null);
  const [modal, setModal] =
    useState<ActionModalState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/automation",
        { cache: "no-store" }
      );

      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: string;
        };

        throw new Error(
          payload.error ??
            "Failed to load automation status"
        );
      }

      const payload =
        (await response.json()) as AutomationStatusResponse;

      setStatus(payload);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load automation status"
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 15_000);

    return () => clearInterval(interval);
  }, [refresh]);

  function actionTitle(action: string): string {
    const titles: Record<string, string> = {
      enable: "Automation Enabled",
      disable: "Automation Disabled",
      "start-daemon": "Scheduler Started",
      "stop-daemon": "Scheduler Stopped",
      "run-backfill": "Update Market Data",
      "run-signal": "Run Signal Now",
      "run-trade-dry": "Preview Trade",
      "run-trade-execute": "Execute Trade (override)"
    };

    return titles[action] ?? "Action Result";
  }

  async function waitForBackfillComplete(
    previousAt: string | null
  ): Promise<AutomationStatusResponse> {
    const deadline = Date.now() + 180_000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });

      const response = await fetch(
        "/api/automation",
        { cache: "no-store" }
      );

      if (!response.ok) {
        continue;
      }

      const payload =
        (await response.json()) as AutomationStatusResponse;

      const backfillAt =
        payload.lastRuns.backfill?.at ??
        null;

      if (
        backfillAt &&
        backfillAt !== previousAt
      ) {
        return payload;
      }
    }

    throw new Error(
      "Backfill timed out after 3 minutes"
    );
  }

  async function runAction(action: string) {
    setRunningAction(action);
    setError(null);

    const backfillBefore =
      status?.lastRuns.backfill?.at ?? null;

    try {
      const response = await fetch(
        "/api/automation",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({ action })
        }
      );

      const payload =
        (await response.json()) as AutomationControlResponse & {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Automation action failed"
        );
      }

      if (
        action === "run-backfill" &&
        payload.message === "Backfill started"
      ) {
        const completed =
          await waitForBackfillComplete(
            backfillBefore
          );

        setStatus(completed);

        if (completed.lastActionLog?.log.length) {
          setModal({
            title: actionTitle(action),
            lines:
              completed.lastActionLog.log,
            success:
              completed.lastActionLog.success
          });
        }

        setError(null);
        return;
      }

      setStatus(payload);

      if (payload.actionLog?.length) {
        setModal({
          title: actionTitle(action),
          lines: payload.actionLog,
          success: payload.success ?? response.ok
        });
      }

      setError(null);
      void refresh();
    } catch (actionError) {
      const message =
        actionError instanceof Error
          ? actionError.message
          : "Automation action failed";

      setError(message);
      setModal({
        title: actionTitle(action),
        lines: [`✗ ${message}`],
        success: false
      });
    } finally {
      setRunningAction(null);
    }
  }

  function closeModal() {
    setModal(null);
  }

  const badge = status
    ? statusBadge(
        status.enabled,
        status.daemonRunning
      )
    : null;

  const freshness =
    status?.signalFreshness;

  return (
    <>
      <ActionLogModal
        open={modal !== null}
        title={modal?.title ?? "Action Log"}
        lines={modal?.lines ?? []}
        success={modal?.success ?? true}
        onClose={closeModal}
      />

      <section
        className="panel"
        style={{ marginTop: 16 }}
      >
        <div className="automation-header">
          <div>
            <h2>Paper Automation</h2>
            <p className="muted">
              Daily aggressive momentum · scheduled
              signal 4:05 PM ET · trade 9:35 AM ET
            </p>
          </div>
          {badge ? (
            <span className={badge.className}>
              {badge.label}
            </span>
          ) : null}
        </div>

        {error ? (
          <p className="error">{error}</p>
        ) : null}

        {runningAction ? (
          <div className="info-banner muted-banner">
            {
              RUNNING_LABELS[runningAction] ??
              "Working…"
            }{" "}
            Other actions unlock when this finishes.
          </div>
        ) : null}

        {freshness?.needsBackfill ? (
          <div className="warning-banner">
            <strong>Step 1 needed.</strong>{" "}
            {freshness.backfillHint}{" "}
            {freshness.staleReason}
          </div>
        ) : freshness?.isStale ? (
          <div className="warning-banner">
            <strong>Signal stale.</strong>{" "}
            {freshness.staleReason}
          </div>
        ) : null}

        {freshness &&
        !freshness.isStale &&
        freshness.canManualExecute ? (
          <div className="info-banner">
            {freshness.manualExecuteHint}
          </div>
        ) : freshness?.manualExecuteHint &&
          !freshness.isStale ? (
          <div className="info-banner muted-banner">
            {freshness.manualExecuteHint}
          </div>
        ) : null}

        {status ? (
          <>
            <div
              className="grid grid-4"
              style={{ marginTop: 12 }}
            >
              <div>
                <p className="muted">Data through</p>
                <p className="metric-value">
                  {freshness?.latestDataDate ??
                    "—"}
                </p>
              </div>
              <div>
                <p className="muted">Signal through</p>
                <p className="metric-value">
                  {freshness?.lastSignalDate ??
                    "—"}
                </p>
              </div>
              <div>
                <p className="muted">Execution</p>
                <p className="metric-value">
                  {status.env.paperTradingEnabled
                    ? "Live paper"
                    : "Dry-run only"}
                </p>
              </div>
              <div>
                <p className="muted">Market</p>
                <p className="metric-value">
                  {status.market?.isOpen
                    ? "Open"
                    : "Closed"}
                </p>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <h3>Automatic mode</h3>
              <p className="muted">
                Start the scheduler, turn automation
                on, and set{" "}
                <code>
                  PAPER_TRADING_ENABLED=true
                </code>{" "}
                when ready. The engine runs steps
                2–4 on schedule — no daily clicks
                required.
              </p>
              <div
                className="button-row"
                style={{ marginTop: 12 }}
              >
                <ActionButton
                  action="start-daemon"
                  runningAction={runningAction}
                  label="Start Scheduler"
                  runningLabel="Starting scheduler…"
                  disabled={status.daemonRunning}
                  onRun={(action) => {
                    void runAction(action);
                  }}
                />
                <ActionButton
                  action="stop-daemon"
                  runningAction={runningAction}
                  label="Stop Scheduler"
                  runningLabel="Stopping scheduler…"
                  disabled={!status.daemonRunning}
                  onRun={(action) => {
                    void runAction(action);
                  }}
                />
                <ActionButton
                  action={
                    status.enabled
                      ? "disable"
                      : "enable"
                  }
                  runningAction={runningAction}
                  label={
                    status.enabled
                      ? "Turn Off"
                      : "Turn On"
                  }
                  runningLabel={
                    status.enabled
                      ? "Turning off…"
                      : "Turning on…"
                  }
                  className="btn btn-primary"
                  onRun={(action) => {
                    void runAction(action);
                  }}
                />
              </div>
              <p
                className="muted"
                style={{ marginTop: 8 }}
              >
                Scheduler:{" "}
                {status.daemonRunning
                  ? `running (PID ${status.daemon.pid})`
                  : "stopped"}
                {" · "}
                Automation:{" "}
                {status.enabled ? "on" : "off"}
                {" · "}
                Next signal:{" "}
                {formatTimestamp(
                  status.nextRuns.signal
                )}
                {" · "}
                Next trade:{" "}
                {formatTimestamp(
                  status.nextRuns.trade
                )}
              </p>
            </div>

            <div style={{ marginTop: 24 }}>
              <h3>Manual workflow</h3>
              <p className="muted">
                Run these in order when doing things
                yourself, after the market close, or
                when recovering from a stale warning.
                Each step opens an action log when
                finished.
              </p>

              <div className="workflow-steps">
                <WorkflowStep
                  step={1}
                  title="Update Market Data"
                  when="After the close, when SQLite is behind (yellow banner), or for first-time setup."
                  does="Downloads missing daily bars for all 30 ETFs from Alpaca (data API only — no orders). Takes about 1–2 minutes."
                  action="run-backfill"
                  buttonLabel="Update Market Data"
                  runningAction={runningAction}
                  highlight={
                    freshness?.needsBackfill ===
                    true
                  }
                  onRun={(action) => {
                    void runAction(action);
                  }}
                />

                <WorkflowStep
                  step={2}
                  title="Run Signal Now"
                  when="After step 1 when data is current, or after the 4:05 PM ET scheduled signal if you want to refresh manually."
                  does="Reads SQLite, computes aggressive momentum, and updates data/signal-state.json. No Alpaca trading calls."
                  action="run-signal"
                  buttonLabel="Run Signal Now"
                  runningAction={runningAction}
                  onRun={(action) => {
                    void runAction(action);
                  }}
                />

                <WorkflowStep
                  step={3}
                  title="Preview Trade"
                  when="Before executing, or any time you want to see what Alpaca would do with the current signal."
                  does="Compares the signal to your paper account and shows planned sells/buys. Does not submit orders."
                  action="run-trade-dry"
                  buttonLabel="Preview Trade"
                  runningAction={runningAction}
                  onRun={(action) => {
                    void runAction(action);
                  }}
                />

                <WorkflowStep
                  step={4}
                  title="Execute Trade (override)"
                  when="Only when the signal is current and you want to trade now instead of waiting for the 9:35 AM ET scheduled run."
                  does="Submits market orders to Alpaca paper. Requires PAPER_TRADING_ENABLED=true. Blocked when the signal is stale."
                  action="run-trade-execute"
                  buttonLabel="Execute Trade (override)"
                  runningAction={runningAction}
                  variant="danger"
                  disabled={
                    !status.env
                      .paperTradingEnabled ||
                    freshness?.isStale === true
                  }
                  disabledReason={
                    !status.env.paperTradingEnabled
                      ? "Set PAPER_TRADING_ENABLED=true in .env"
                      : freshness?.isStale
                        ? "Refresh signal first (steps 1–2)"
                        : undefined
                  }
                  onRun={(action) => {
                    void runAction(action);
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <h3>Recent Runs</h3>
              {status.runLog.length === 0 ? (
                <p className="muted">
                  No automation runs yet.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Time (ET)</th>
                      <th>Job</th>
                      <th>Trigger</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.runLog
                      .slice(0, 8)
                      .map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            {formatTimestamp(
                              entry.at
                            )}
                          </td>
                          <td>{entry.job}</td>
                          <td>{entry.trigger}</td>
                          <td>
                            <span
                              className={
                                entry.success
                                  ? "positive"
                                  : "negative"
                              }
                            >
                              {entry.message}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <p className="muted">
            Loading automation status…
          </p>
        )}
      </section>
    </>
  );
}
