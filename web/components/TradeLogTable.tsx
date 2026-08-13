import type { DashboardTrade } from "@/types/dashboard";

function formatSide(
  side: DashboardTrade["side"]
): string {
  return side === "buy" ? "Buy" : "Sell";
}

export function TradeLogTable({
  trades,
  limit
}: {
  trades: DashboardTrade[];
  limit?: number;
}) {
  const rows = limit
    ? trades.slice(-limit).reverse()
    : trades.slice().reverse();

  if (rows.length === 0) {
    return (
      <p className="muted">
        No trades in this period.
      </p>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Date</th>
          <th>Side</th>
          <th>Symbol</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Reason</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((trade) => (
          <tr key={trade.id}>
            <td>
              <code>{trade.id}</code>
            </td>
            <td>{trade.date}</td>
            <td
              className={
                trade.side === "buy"
                  ? "positive"
                  : "negative"
              }
            >
              {formatSide(trade.side)}
            </td>
            <td>{trade.symbol}</td>
            <td>{trade.quantity}</td>
            <td>${trade.price.toFixed(2)}</td>
            <td>{trade.reasonLabel}</td>
            <td className="muted">
              {trade.detail ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
