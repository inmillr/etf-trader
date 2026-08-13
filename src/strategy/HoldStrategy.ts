import type {
  Strategy,
  StrategyContext,
  StrategyOrder
} from "../backtest/Strategy.js";

export class HoldStrategy implements Strategy {
  onCandle(
    _context: StrategyContext
  ): StrategyOrder | null {
    return null;
  }
}
