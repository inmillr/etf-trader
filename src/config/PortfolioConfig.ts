export const DEFAULT_INITIAL_CASH = Number(
  process.env.INITIAL_CASH ?? 1_000
);

export const DEFAULT_PORTFOLIO = {
  initialCash: DEFAULT_INITIAL_CASH,
  commissionPerTrade: 1,
  slippagePercent: 0.05
} as const;
