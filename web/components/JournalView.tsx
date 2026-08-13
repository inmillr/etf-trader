"use client";

import { useMemo, useState } from "react";

import { EquityChart } from "@/components/EquityChart";
import { SiteHeader } from "@/components/SiteHeader";
import type {
  DashboardJournalResponse
} from "@/types/dashboard";

export function JournalView({
  initialData
}: {
  initialData: DashboardJournalResponse;
}) {
  const [start, setStart] = useState(
    initialData.start
  );

  const [end, setEnd] = useState(
    initialData.end
  );

  const [data, setData] =
    useState(initialData);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] = useState<
    string | null
  >(null);

  async function loadJournal() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/journal?start=${start}&end=${end}`
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load journal"
        );
      }

      setData(await response.json());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load journal"
      );
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(
    () =>
      data.entries.map((entry) => ({
        date: entry.date,
        equity: entry.equity
      })),
    [data.entries]
  );

  return (
    <main>
      <SiteHeader active="journal" />

      <section className="panel">
        <h2>Daily Journal</h2>

        <div className="controls">
          <label>
            Start
            <input
              type="date"
              value={start}
              onChange={(event) =>
                setStart(event.target.value)
              }
            />
          </label>
          <label>
            End
            <input
              type="date"
              value={end}
              onChange={(event) =>
                setEnd(event.target.value)
              }
            />
          </label>
          <button
            type="button"
            onClick={loadJournal}
            disabled={loading}
            style={{
              alignSelf: "flex-end",
              background: "#4da3ff",
              border: "none",
              borderRadius: 8,
              color: "#0b0f14",
              cursor: "pointer",
              fontWeight: 600,
              padding: "10px 16px"
            }}
          >
            {loading ? "Loading…" : "Load"}
          </button>
        </div>

        {error ? (
          <p className="error">{error}</p>
        ) : null}

        <div className="grid grid-4">
          <div>
            <p className="muted">Return</p>
            <p className="metric-value">
              {data.summary.returnPercent.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="muted">Max drawdown</p>
            <p className="metric-value negative">
              {data.summary.maxDrawdown.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="muted">Trades</p>
            <p className="metric-value">
              {data.summary.trades}
            </p>
          </div>
        </div>
      </section>

      <section
        className="panel"
        style={{ marginTop: 16 }}
      >
        <h2>Equity</h2>
        <EquityChart data={chartData} />
      </section>

      <section
        className="panel"
        style={{ marginTop: 16 }}
      >
        <h2>Entries</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Equity</th>
              <th>Day %</th>
              <th>Position</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {data.entries
              .slice()
              .reverse()
              .slice(0, 120)
              .map((entry) => (
                <tr
                  key={entry.date}
                  className={
                    entry.rebalance
                      ? "rebalance"
                      : ""
                  }
                >
                  <td>{entry.date}</td>
                  <td>
                    ${entry.equity.toFixed(2)}
                  </td>
                  <td
                    className={
                      entry.dayReturnPercent >= 0
                        ? "positive"
                        : "negative"
                    }
                  >
                    {entry.dayReturnPercent >= 0
                      ? "+"
                      : ""}
                    {entry.dayReturnPercent.toFixed(2)}%
                  </td>
                  <td>{entry.position}</td>
                  <td>
                    {entry.rebalance
                      ? "rebalance"
                      : ""}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
