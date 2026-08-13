export interface AlpacaConfig {
  apiKey: string;
  apiSecret: string;
  tradingBaseUrl: string;
  marketDataBaseUrl: string;
  paper: boolean;
}

export function getAlpacaConfig(): AlpacaConfig {
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

  const paper =
    process.env.ALPACA_PAPER !== "false";

  return {
    apiKey,
    apiSecret,

    tradingBaseUrl: paper
      ? "https://paper-api.alpaca.markets/v2"
      : "https://api.alpaca.markets/v2",

    marketDataBaseUrl:
      "https://data.alpaca.markets",

    paper
  };
}