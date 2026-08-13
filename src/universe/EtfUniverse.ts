import type { AlpacaConfig } from "../config/AlpacaConfig.js";
import type { EtfCandidate } from "./EtfRank.js";

export const DEFAULT_ETF_UNIVERSE: EtfCandidate[] = [
  { symbol: "SPY", name: "SPDR S&P 500", category: "broad" },
  { symbol: "QQQ", name: "Invesco QQQ", category: "broad" },
  { symbol: "IWM", name: "iShares Russell 2000", category: "broad" },
  { symbol: "DIA", name: "SPDR Dow Jones", category: "broad" },

  { symbol: "XLK", name: "Technology Select Sector", category: "sector" },
  { symbol: "XLF", name: "Financial Select Sector", category: "sector" },
  { symbol: "XLE", name: "Energy Select Sector", category: "sector" },
  { symbol: "XLV", name: "Health Care Select Sector", category: "sector" },
  { symbol: "XLI", name: "Industrial Select Sector", category: "sector" },
  { symbol: "XLY", name: "Consumer Discretionary", category: "sector" },
  { symbol: "XLP", name: "Consumer Staples", category: "sector" },
  { symbol: "XLB", name: "Materials Select Sector", category: "sector" },
  { symbol: "XLU", name: "Utilities Select Sector", category: "sector" },
  { symbol: "XLRE", name: "Real Estate Select Sector", category: "sector" },
  { symbol: "XLC", name: "Communication Services", category: "sector" },

  { symbol: "SOXX", name: "iShares Semiconductor", category: "thematic" },
  { symbol: "SMH", name: "VanEck Semiconductor", category: "thematic" },
  { symbol: "ARKK", name: "ARK Innovation", category: "thematic" },
  { symbol: "XBI", name: "SPDR Biotech", category: "thematic" },
  { symbol: "TAN", name: "Invesco Solar", category: "thematic" },
  { symbol: "ICLN", name: "iShares Clean Energy", category: "thematic" },
  { symbol: "URA", name: "Global X Uranium", category: "thematic" },

  { symbol: "EEM", name: "iShares Emerging Markets", category: "international" },
  { symbol: "EFA", name: "iShares EAFE", category: "international" },
  { symbol: "FXI", name: "iShares China Large-Cap", category: "international" },

  { symbol: "TLT", name: "iShares 20+ Year Treasury", category: "fixed-income" },
  { symbol: "HYG", name: "iShares High Yield Corporate", category: "fixed-income" },

  { symbol: "GLD", name: "SPDR Gold", category: "commodity" },
  { symbol: "SLV", name: "iShares Silver", category: "commodity" },
  { symbol: "USO", name: "United States Oil", category: "commodity" }
];

export const LIQUID_ETF_UNIVERSE: EtfCandidate[] =
  DEFAULT_ETF_UNIVERSE.filter(
    (candidate) =>
      candidate.category === "broad"
  );

export const LIQUID_ETF_SYMBOLS: readonly string[] =
  LIQUID_ETF_UNIVERSE.map(
    (candidate) => candidate.symbol
  );

export function filterLiquidCandidates(
  candidates: EtfCandidate[]
): EtfCandidate[] {
  const liquidSymbols = new Set(
    LIQUID_ETF_SYMBOLS
  );

  return candidates.filter((candidate) =>
    liquidSymbols.has(candidate.symbol)
  );
}

export interface UniverseProvider {
  getCandidates(): Promise<EtfCandidate[]>;
}

export class StaticUniverseProvider
  implements UniverseProvider {

  constructor(
    private readonly candidates: EtfCandidate[] =
      DEFAULT_ETF_UNIVERSE
  ) {}

  async getCandidates(): Promise<EtfCandidate[]> {
    return [...this.candidates];
  }
}

interface AlpacaAsset {
  symbol: string;
  name: string;
  tradable: boolean;
  status: string;
  class: string;
}

export class AlpacaUniverseProvider
  implements UniverseProvider {

  constructor(
    private readonly config: AlpacaConfig,
    private readonly seedUniverse: EtfCandidate[] =
      DEFAULT_ETF_UNIVERSE
  ) {}

  async getCandidates(): Promise<EtfCandidate[]> {
    const url = new URL(
      `${this.config.tradingBaseUrl}/assets`
    );

    url.searchParams.set("status", "active");
    url.searchParams.set("asset_class", "us_equity");

    const response = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": this.config.apiKey,
        "APCA-API-SECRET-KEY": this.config.apiSecret
      }
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Alpaca assets request failed: ${response.status} ${response.statusText} - ${body}`
      );
    }

    const assets = await response.json() as AlpacaAsset[];

    const tradableSymbols = new Set(
      assets
        .filter(
          (asset) =>
            asset.tradable &&
            asset.status === "active"
        )
        .map((asset) => asset.symbol)
    );

    return this.seedUniverse.filter(
      (candidate) =>
        tradableSymbols.has(candidate.symbol)
    );
  }
}
