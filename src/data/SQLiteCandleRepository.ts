import Database from "better-sqlite3";
import type { Candle, Timeframe } from "../types/market.js";
import type {
  CandleQuery,
  CandleCoverage,
  CandleRepository
} from "./CandleRepository.js";

export class SQLiteCandleRepository
  implements CandleRepository {

  private readonly db: Database.Database;

  constructor(databasePath: string) {
  console.log("A. Constructor started");

  this.db = new Database(databasePath);

  console.log("B. Database opened");

  this.db.pragma("journal_mode = WAL");

  console.log("C. WAL configured");

  this.initialize();

  console.log("D. Database initialized");
  }
  close(): void {
  this.db.close();
}

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS candles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,

        timestamp TEXT NOT NULL,

        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,

        volume INTEGER NOT NULL,

        UNIQUE (
          symbol,
          timeframe,
          timestamp
        )
      );

      CREATE INDEX IF NOT EXISTS idx_candles_lookup
      ON candles (
        symbol,
        timeframe,
        timestamp
      );
    `);
  }

  async save(candles: Candle[]): Promise<void> {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO candles (
        symbol,
        timeframe,
        timestamp,
        open,
        high,
        low,
        close,
        volume
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(
      (items: Candle[]) => {
        for (const candle of items) {
          insert.run(
            candle.symbol,
            candle.timeframe,
            candle.timestamp.toISOString(),
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            candle.volume
          );
        }
      }
    );

    transaction(candles);
  }

  async getCandles(
    query: CandleQuery
  ): Promise<Candle[]> {
    const rows = this.db.prepare(`
      SELECT
        symbol,
        timeframe,
        timestamp,
        open,
        high,
        low,
        close,
        volume
      FROM candles
      WHERE symbol = ?
        AND timeframe = ?
        AND timestamp >= ?
        AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(
      query.symbol,
      query.timeframe,
      query.start.toISOString(),
      query.end.toISOString()
    ) as Array<{
      symbol: string;
      timeframe: Timeframe;
      timestamp: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;

    return rows.map((row) => ({
      symbol: row.symbol,
      timeframe: row.timeframe,
      timestamp: new Date(row.timestamp),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume
    }));
  }

  async getCoverage(
  symbol: string,
  timeframe: Timeframe
): Promise<CandleCoverage> {
  const row = this.db.prepare(`
    SELECT
      MIN(timestamp) AS earliest,
      MAX(timestamp) AS latest,
      COUNT(*) AS count
    FROM candles
    WHERE symbol = ?
      AND timeframe = ?
  `).get(
    symbol,
    timeframe
  ) as {
    earliest: string | null;
    latest: string | null;
    count: number;
  };

  return {
    earliest: row.earliest
      ? new Date(row.earliest)
      : null,

    latest: row.latest
      ? new Date(row.latest)
      : null,

    count: row.count
  };
}

  async getTimestamps(
  query: CandleQuery
): Promise<Date[]> {
  const rows = this.db.prepare(`
    SELECT timestamp
    FROM candles
    WHERE symbol = ?
      AND timeframe = ?
      AND timestamp >= ?
      AND timestamp <= ?
    ORDER BY timestamp ASC
  `).all(
    query.symbol,
    query.timeframe,
    query.start.toISOString(),
    query.end.toISOString()
  ) as Array<{
    timestamp: string;
  }>;

  return rows.map(
    (row) => new Date(row.timestamp)
  );
}

  listSymbols(
    timeframe: Timeframe
  ): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT symbol
      FROM candles
      WHERE timeframe = ?
      ORDER BY symbol ASC
    `).all(timeframe) as Array<{
      symbol: string;
    }>;

    return rows.map(
      (row) => row.symbol
    );
  }
}