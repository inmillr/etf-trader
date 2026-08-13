"use client";

import { useCallback, useEffect, useState } from "react";

import type {
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

export function AutomationPanel() {
  const [status, setStatus] =
    useState<AutomationStatusResponse | null>(
      null
    );
  const [error, setError] = useState<
    string | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<
    string | null
  >(null);

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

  async function runAction(action: string) {
    setBusy(true);
    setNotice(null);

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

      const payload = (await response.json()) as
        AutomationStatusResponse & {
          error?: string;
          message?: string;
        };

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Automation action failed"
        );
      }

      setStatus(payload);
      setNotice(
        payload.message ??
          `Action ${action} completed`
      );
      setError(null);

      window.setTimeout(() => {
        void refresh();
      }, 1500);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Automation action failed"
      );
    } finally {
      setBusy(false);
    }
  }

  const badge = status
    ? statusBadge(
        status.enabled,
        status.daemonRunning
      )
    : null;

  return (
    <section
      className="panel"
      style={{ marginTop: 16 }}
    >
      <div className="automation-header">
        <div>
          <h2>Paper Automation</h2>
          <p className="muted">
            Daily aggressive momentum · signal
            after close · trade after open (ET)
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

      {notice ? (
        <p className="notice">{notice}</p>
      ) : null}

      {status ? (
        <>
          <div
            className="grid grid-4"
            style={{ marginTop: 12 }}
          >
            <div>
              <p className="muted">Automation</p>
              <p className="metric-value">
                {status.enabled ? "ON" : "OFF"}
              </p>
            </div>
            <div>
              <p className="muted">Daemon</p>
              <p className="metric-value">
                {status.daemonRunning
                  ? `PID ${status.daemon.pid}`
                  : "Stopped"}
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

          <div
            className="grid grid-2"
            style={{ marginTop: 12 }}
          >
            <div>
              <p className="muted">
                Next signal run (ET)
              </p>
              <p>
                {formatTimestamp(
                  status.nextRuns.signal
                )}
              </p>
              <p className="muted">
                Scheduled {status.schedule.signalTimeEt} ET
              </p>
            </div>
            <div>
              <p className="muted">
                Next trade run (ET)
              </p>
              <p>
                {formatTimestamp(
                  status.nextRuns.trade
                )}
              </p>
              <p className="muted">
                Scheduled {status.schedule.tradeTimeEt} ET
                {status.env.paperTradingEnabled
                  ? " · executes orders"
                  : " · preview only until PAPER_TRADING_ENABLED=true"}
              </p>
            </div>
          </div>

          <div
            className="button-row"
            style={{ marginTop: 16 }}
          >
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                void runAction(
                  status.enabled
                    ? "disable"
                    : "enable"
                )
              }
            >
              {status.enabled
                ? "Turn Off"
                : "Turn On"}
            </button>

            <button
              type="button"
              className="btn"
              disabled={
                busy || status.daemonRunning
              }
              onClick={() =>
                void runAction("start-daemon")
              }
            >
              Start Scheduler
            </button>

            <button
              type="button"
              className="btn"
              disabled={
                busy || !status.daemonRunning
              }
              onClick={() =>
                void runAction("stop-daemon")
              }
            >
              Stop Scheduler
            </button>
          </div>

          <div
            className="button-row"
            style={{ marginTop: 12 }}
          >
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void runAction("run-signal")
              }
            >
              Run Signal Now
            </button>

            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void runAction("run-trade-dry")
              }
            >
              Preview Trade
            </button>

            <button
              type="button"
              className="btn btn-danger"
              disabled={
                busy ||
                !status.env.paperTradingEnabled
              }
              title={
                status.env.paperTradingEnabled
                  ? "Submit paper orders now"
                  : "Set PAPER_TRADING_ENABLED=true in .env first"
              }
              onClick={() =>
                void runAction(
                  "run-trade-execute"
                )
              }
            >
              Execute Trade
            </button>
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
        <p className="muted">Loading automation status…</p>
      )}
    </section>
  );
}
