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
      <h2>Today&apos;s Signal</h2>
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
          {signal.targetSymbol ?? "(cash)"}
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
        <dt className="muted">Model pick</dt>
        <dd>{signal.rawPick ?? "(cash)"}</dd>
        <dt className="muted">Rebalance day</dt>
        <dd>
          {signal.isRebalanceDay
            ? "Yes (Monday)"
            : "No"}
        </dd>
        <dt className="muted">Absolute momentum</dt>
        <dd>
          {signal.absoluteMomentumPassed
            ? "Pass"
            : "Fail"}
        </dd>
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
        <h3>Rankings (126d return)</h3>
        {signal.rankings.map((entry, index) => {
          const maxReturn = Math.max(
            ...signal.rankings.map(
              (item) =>
                Math.abs(
                  item.trailingReturn
                )
            ),
            1
          );

          const width =
            (Math.abs(entry.trailingReturn) /
              maxReturn) *
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
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
              <span
                className={
                  entry.trailingReturn >= 0
                    ? "positive"
                    : "negative"
                }
              >
                {entry.trailingReturn.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
