import type { AlpacaConfig } from "../config/AlpacaConfig.js";
import type {
  AlpacaAccount,
  AlpacaClock,
  AlpacaOrder,
  AlpacaOrderRequest,
  AlpacaPosition
} from "./AlpacaTradingTypes.js";

type FetchFn = typeof fetch;

export class AlpacaTradingClient {
  constructor(
    private readonly config: AlpacaConfig,
    private readonly fetchImpl: FetchFn = fetch
  ) {}

  async getAccount(): Promise<AlpacaAccount> {
    return this.request<AlpacaAccount>("/account");
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    return this.request<AlpacaPosition[]>("/positions");
  }

  async getPosition(
    symbol: string
  ): Promise<AlpacaPosition | null> {
    try {
      return await this.request<AlpacaPosition>(
        `/positions/${encodeURIComponent(symbol)}`
      );
    } catch (error) {
      if (
        error instanceof AlpacaTradingError &&
        error.statusCode === 404
      ) {
        return null;
      }

      throw error;
    }
  }

  async getClock(): Promise<AlpacaClock> {
    return this.request<AlpacaClock>("/clock");
  }

  async createOrder(
    order: AlpacaOrderRequest
  ): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(
      "/orders",
      {
        method: "POST",
        body: JSON.stringify(order)
      }
    );
  }

  async closePosition(
    symbol: string
  ): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(
      `/positions/${encodeURIComponent(symbol)}`,
      { method: "DELETE" }
    );
  }

  async closeAllPositions(): Promise<AlpacaOrder[]> {
    return this.request<AlpacaOrder[]>(
      "/positions",
      { method: "DELETE" }
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const url =
      `${this.config.tradingBaseUrl}${path}`;

    const response = await this.fetchImpl(
      url,
      {
        ...init,
        headers: {
          "APCA-API-KEY-ID":
            this.config.apiKey,
          "APCA-API-SECRET-KEY":
            this.config.apiSecret,
          "Content-Type":
            "application/json",
          ...(init.headers ?? {})
        }
      }
    );

    const body = await response.text();

    if (!response.ok) {
      throw new AlpacaTradingError(
        `Alpaca trading request failed: ${response.status} ${response.statusText} - ${body}`,
        response.status
      );
    }

    if (!body) {
      return [] as T;
    }

    return JSON.parse(body) as T;
  }
}

export class AlpacaTradingError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "AlpacaTradingError";
  }
}
