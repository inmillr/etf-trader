import "dotenv/config";

import { getAlpacaConfig } from "../config/AlpacaConfig.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import {
  AlpacaUniverseProvider,
  StaticUniverseProvider
} from "../universe/EtfUniverse.js";
import { EtfScanner } from "../universe/EtfScanner.js";
import { RepositoryCandleSource } from "../universe/RepositoryCandleSource.js";

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

const lookbackDays = Number(
  process.argv[2] ?? 60
);

const topCount = Number(
  process.argv[3] ?? 10
);

const useAlpacaValidation =
  process.argv.includes("--live-universe");

const repository =
  new SQLiteCandleRepository(
    databasePath
  );

try {
  const universeProvider = useAlpacaValidation
    ? new AlpacaUniverseProvider(
        getAlpacaConfig()
      )
    : new StaticUniverseProvider();

  const candidates =
    await universeProvider.getCandidates();

  const scanner = new EtfScanner(
    new RepositoryCandleSource(
      repository,
      "1d"
    ),
    {
      lookbackDays
    }
  );

  console.log(
    `Scanning ${candidates.length} ETF candidates ` +
    `(${lookbackDays}-day lookback)...`
  );

  console.log("");

  const results = await scanner.scanTop(
    candidates,
    topCount
  );

  if (results.length === 0) {
    console.log(
      "No ETFs passed the universe filter. " +
      "Backfill daily candles first, e.g.:\n" +
      "  npm run backfill -- SPY,QQQ,XLK 1d 2025-01-01 2026-08-13"
    );
  } else {
    console.log(
      "Rank  Symbol  Category       Score   Mom5d   Mom20d  Trend   RelVol  ATR Fit  Max DD"
    );

    console.log(
      "-".repeat(88)
    );

    for (const result of results) {
      console.log(
        `${String(result.rank).padStart(4)}  ` +
        `${result.symbol.padEnd(6)}  ` +
        `${result.category.padEnd(13)}  ` +
        `${result.score.toFixed(1).padStart(5)}  ` +
        `${result.factors.relativeMomentum5d.toFixed(2).padStart(6)}  ` +
        `${result.factors.relativeMomentum20d.toFixed(2).padStart(6)}  ` +
        `${result.factors.trendStrength.toFixed(2).padStart(5)}  ` +
        `${result.factors.relativeVolume.toFixed(2).padStart(6)}  ` +
        `${result.factors.volatilityFit.toFixed(2).padStart(7)}  ` +
        `${result.factors.drawdown.toFixed(2).padStart(6)}`
      );
    }
  }
} finally {
  repository.close();
}
