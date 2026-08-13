import type {
  DashboardSignalResponse
} from "@/types/dashboard";

function badgeClass(
  action: string
): string {
  switch (action) {
    case "buy":
      return "badge badge-buy";
    case "hold":
      return "badge badge-hold";
    case "rotate":
    case "exit":
      return "badge badge-rotate";
    default:
      return "badge badge-cash";
  }
}

export function SignalCard({
  signal
}: {
  signal: DashboardSignalResponse;
}) {
  return (
    <section className="panel">
      <h2>Today&apos;s Signal · Hybrid</h2>
      <p className="muted">
        Data through {signal.signalDate} ·
        selection as of{" "}
        {signal.selectionAsOfDate}
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          margin: "16px 0"
        }}
      >
        <span
          className={badgeClass(
            signal.action
          )}
        >
          {signal.action.replace("_", " ")}
        </span>
        <strong style={{ fontSize: "1.25rem" }}>
          {signal.targetSymbol ??
            signal.heldSymbol ??
            "(flat)"}
        </strong>
      </div>

      <p>{signal.reason}</p>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "140px 1fr",
          gap: "8px 12px",
          marginTop: 16
        }}
      >
        <dt className="muted">Universe pick</dt>
        <dd>{signal.rawPick ?? "(none)"}</dd>
        <dt className="muted">Daily trend</dt>
        <dd>
          {signal.trendBullish
            ? "Bullish"
            : "Not bullish"}
          {signal.bearishCrossover
            ? " · bearish cross"
            : ""}
        </dd>
        <dt className="muted">5m setup</dt>
        <dd>
          {signal.intradaySetup
            ? "Ready"
            : signal.inEntryWindow
              ? "Watching"
              : "Outside window"}
        </dd>
        <dt className="muted">Rebalance day</dt>
        <dd>
          {signal.isRebalanceDay
            ? "Yes (Monday)"
            : "No"}
        </dd>
        {signal.trendFast !== null ? (
          <>
            <dt className="muted">MA 20/50</dt>
            <dd>
              {signal.trendFast.toFixed(2)} /{" "}
              {signal.trendSlow?.toFixed(2) ??
                "—"}
            </dd>
          </>
        ) : null}
        {signal.heldSymbol ? (
          <>
            <dt className="muted">Current hold</dt>
            <dd>
              {signal.heldSymbol}
              {signal.heldSinceDay
                ? ` since ${signal.heldSinceDay}`
                : ""}
            </dd>
          </>
        ) : null}
      </dl>

      <div
        className="rankings"
        style={{ marginTop: 20 }}
      >
        <h3>Rankings (30d score · liquid ETFs)</h3>
        {signal.rankings.slice(0, 8).map(
          (entry, index) => {
            const maxScore = Math.max(
              ...signal.rankings
                .slice(0, 8)
                .map((item) =>
                  Math.abs(item.score)
                ),
              1
            );

            const width =
              (Math.abs(entry.score) /
                maxScore) *
              100;

            return (
              <div
                key={entry.symbol}
                className="rank-row"
              >
                <span>#{index + 1}</span>
                <div>
                  <strong>{entry.symbol}</strong>
                  <div className="rank-bar">
                    <span
                      style={{
                        width: `${width}%`
                      }}
                    />
                  </div>
                </div>
                <span>
                  {entry.score.toFixed(2)}
                </span>
              </div>
            );
          }
        )}
      </div>
    </section>
  );
}
