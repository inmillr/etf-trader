import { getAlpacaMarketDataConfig } from "../config/AlpacaMarketDataConfig.js";
import { HistoricalDataService } from "../data/HistoricalDataService.js";
import { MarketDataService } from "../data/MarketDataService.js";
import { AlpacaMarketDataProvider } from "../data/providers/AlpacaMarketDataProvider.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import type { Timeframe } from "../types/market.js";
import { StaticUniverseProvider } from "../universe/EtfUniverse.js";
import {
  StrategyDashboardService
} from "../services/StrategyDashboardService.js";

export interface BackfillRunResult {
  success: boolean;
  message: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  symbolCount: number;
  symbolsUpdated: number;
  newCandles: number;
  latestDataDateBefore: string | null;
  latestDataDateAfter: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class MarketDataBackfillRunner {
  private readonly databasePath =
    process.env.DATABASE_PATH ??
    "./data/market.db";

  private readonly dashboard =
    new StrategyDashboardService();

  async runDailyUpdate(
    options: {
      lookbackDays?: number;
      overlapDays?: number;
    } = {}
  ): Promise<BackfillRunResult> {
    const lookbackDays =
      options.lookbackDays ?? 365;

    const overlapDays =
      options.overlapDays ?? 7;

    const timeframe: Timeframe = "1d";
    const end = new Date();

    const latestBefore =
      await this.dashboard.getLatestDataDate();

    const start = latestBefore
      ? new Date(`${latestBefore}T00:00:00.000Z`)
      : new Date(end);

    if (latestBefore) {
      start.setUTCDate(
        start.getUTCDate() - overlapDays
      );
    } else {
      start.setUTCDate(
        start.getUTCDate() - lookbackDays
      );
    }

    const repository =
      new SQLiteCandleRepository(
        this.databasePath
      );

    try {
      const credentials =
        getAlpacaMarketDataConfig();

      const candidates =
        await new StaticUniverseProvider().getCandidates();

      const symbols = candidates.map(
        (candidate) => candidate.symbol
      );

      const alpacaProvider =
        new AlpacaMarketDataProvider({
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          tradingBaseUrl: "",
          marketDataBaseUrl:
            credentials.marketDataBaseUrl,
          paper: true
        });

      const marketDataService =
        new MarketDataService(
          alpacaProvider,
          repository
        );

      const historicalDataService =
        new HistoricalDataService(
          marketDataService,
          { chunkDays: 30 }
        );

      let newCandles = 0;
      let symbolsUpdated = 0;

      for (const symbol of symbols) {
        const fetched =
          await historicalDataService.fetchRange(
            {
              symbol,
              timeframe,
              start,
              end
            }
          );

        if (fetched > 0) {
          symbolsUpdated += 1;
        }

        newCandles += fetched;

        await sleep(1500);
      }

      const latestAfter =
        await this.dashboard.getLatestDataDate();

      return {
        success: true,
        message:
          `Downloaded ${newCandles} new daily bar(s) for ${symbolsUpdated}/${symbols.length} ETFs`,
        timeframe,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        symbolCount: symbols.length,
        symbolsUpdated,
        newCandles,
        latestDataDateBefore: latestBefore,
        latestDataDateAfter: latestAfter
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Backfill failed",
        timeframe,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        symbolCount: 0,
        symbolsUpdated: 0,
        newCandles: 0,
        latestDataDateBefore: latestBefore,
        latestDataDateAfter: latestBefore
      };
    } finally {
      repository.close();
    }
  }
}
