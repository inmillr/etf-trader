import type { FillJournalEntry } from "@/types/dashboard";

function formatPrice(
  value: number | null | undefined
): string {
  if (value == null) {
    return "—";
  }

  return `$${value.toFixed(2)}`;
}

function formatBps(
  from: number | null,
  to: number | null,
  favorableWhenPositive: boolean
): {
  text: string;
  className: string;
} {
  if (
    from == null ||
    to == null ||
    from <= 0
  ) {
    return {
      text: "—",
      className: "muted"
    };
  }

  const bps = ((to - from) / from) * 10_000;
  const favorable = favorableWhenPositive
    ? bps > 0
    : bps < 0;

  const prefix = bps > 0 ? "+" : "";

  return {
    text: `${prefix}${bps.toFixed(0)} bps`,
    className:
      bps === 0
        ? "muted"
        : favorable
          ? "positive"
          : "negative"
  };
}

export function FillJournalTable({
  entries
}: {
  entries: FillJournalEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="muted">
        No live fills yet. Preview or execute a
        trade to compare Alpaca against the
        backtest close.
      </p>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Side</th>
          <th>Symbol</th>
          <th>Mode</th>
          <th>Backtest close</th>
          <th>Alpaca fill</th>
          <th>vs backtest</th>
          <th>Next close</th>
          <th>vs next close</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const livePrice =
            entry.alpacaFillPrice ??
            entry.backtestPrice;
          const vsBacktest = formatBps(
            entry.backtestPrice,
            entry.alpacaFillPrice,
            entry.side === "sell"
          );
          const vsNext = formatBps(
            livePrice,
            entry.nextClose,
            entry.side === "buy"
          );

          return (
            <tr key={entry.id}>
              <td>{entry.day}</td>
              <td>{entry.side.toUpperCase()}</td>
              <td>{entry.symbol}</td>
              <td>{entry.mode}</td>
              <td>
                {formatPrice(entry.backtestPrice)}
              </td>
              <td>
                {formatPrice(
                  entry.alpacaFillPrice
                )}
              </td>
              <td className={vsBacktest.className}>
                {vsBacktest.text}
              </td>
              <td>
                {formatPrice(entry.nextClose)}
                {entry.nextCloseDate
                  ? ` (${entry.nextCloseDate})`
                  : ""}
              </td>
              <td className={vsNext.className}>
                {vsNext.text}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
