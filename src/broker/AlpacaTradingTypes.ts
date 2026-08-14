export interface AlpacaAccount {
  id: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  account_blocked: boolean;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: "long" | "short";
  market_value: string;
  avg_entry_price: string;
  current_price: string;
}

export interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export interface AlpacaOrderRequest {
  symbol: string;
  qty: string;
  side: "buy" | "sell";
  type: "market";
  time_in_force: "day";
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  status: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  filled_avg_price?: string | null;
  side: "buy" | "sell";
  type: string;
  submitted_at: string;
  filled_at: string | null;
}
