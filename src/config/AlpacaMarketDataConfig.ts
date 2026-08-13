export interface AlpacaMarketDataConfig {
  apiKey: string;
  apiSecret: string;
  marketDataBaseUrl: string;
}

export function getAlpacaMarketDataConfig(): AlpacaMarketDataConfig {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;

  if (!apiKey) {
    throw new Error(
      "ALPACA_API_KEY environment variable is not set."
    );
  }

  if (!apiSecret) {
    throw new Error(
      "ALPACA_API_SECRET environment variable is not set."
    );
  }

  return {
    apiKey,
    apiSecret,
    marketDataBaseUrl:
      "https://data.alpaca.markets"
  };
}
