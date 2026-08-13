import {
  getDashboardBacktest,
  getDashboardSignal
} from "@/lib/dashboard";
import { EquityChart } from "@/components/EquityChart";
import { SignalCard } from "@/components/SignalCard";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

function formatPercent(
  value: number
): string {
  const prefix = value >= 0 ? "+" : "";

  return `${prefix}${value.toFixed(2)}%`;
}

export default async function DashboardPage() {
  try {
    const [signal, backtest] =
      await Promise.all([
        getDashboardSignal(),
        getDashboardBacktest(
          "2025-01-01",
          "2026-08-08"
        )
      ]);

    return (
      <main>
        <SiteHeader active="dashboard" />

        <SignalCard signal={signal} />

        <section
          className="panel"
          style={{ marginTop: 16 }}
        >
          <h2>
            Backtest · {backtest.start} →{" "}
            {backtest.end}
          </h2>
          <div
            className="grid grid-4"
            style={{ marginTop: 12 }}
          >
            <div>
              <p className="muted">Strategy return</p>
              <p
                className={`metric-value ${
                  backtest.returnPercent >= 0
                    ? "positive"
                    : "negative"
                }`}
              >
                {formatPercent(
                  backtest.returnPercent
                )}
              </p>
            </div>
            <div>
              <p className="muted">SPY return</p>
              <p className="metric-value">
                {formatPercent(
                  backtest.spyReturn
                )}
              </p>
            </div>
            <div>
              <p className="muted">Max drawdown</p>
              <p className="metric-value negative">
                {backtest.maxDrawdown.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="muted">Final equity</p>
              <p className="metric-value">
                ${backtest.finalEquity.toFixed(2)}
              </p>
            </div>
          </div>
        </section>

        <section
          className="panel"
          style={{ marginTop: 16 }}
        >
          <h2>Equity Curve</h2>
          <EquityChart
            data={backtest.equityCurve}
          />
        </section>

        <section
          className="panel"
          style={{ marginTop: 16 }}
        >
          <h2>Recent Selections</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbol</th>
              </tr>
            </thead>
            <tbody>
              {backtest.selections
                .slice(-12)
                .reverse()
                .map((selection) => (
                  <tr key={selection.date}>
                    <td>{selection.date}</td>
                    <td>
                      {selection.symbols.join(
                        ", "
                      ) || "(cash)"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      </main>
    );
  } catch (loadError) {
    const error =
      loadError instanceof Error
        ? loadError.message
        : "Failed to load dashboard";

    return (
      <main>
        <SiteHeader active="dashboard" />
        <p className="error">{error}</p>
        <p className="muted">
          Ensure ./data/market.db exists. Run{" "}
          <code>npm run backfill:once</code> from
          the project root if needed.
        </p>
      </main>
    );
  }
}
