import {
  AlpacaTradingClient,
  AlpacaTradingError
} from "../broker/AlpacaTradingClient.js";
import {
  buildPaperTradePlan,
  calculateBuyQty,
  formatPaperTradePlan,
  resolveBrokerHoldings,
  type BrokerHoldings,
  type PaperTradePlan
} from "../broker/PaperTradingService.js";
import {
  loadSignalState,
  saveSignalState,
  signalStateAfterAction
} from "../broker/SignalStateStore.js";
import { getAlpacaConfig } from "../config/AlpacaConfig.js";
import { DEFAULT_INITIAL_CASH } from "../config/PortfolioConfig.js";
import {
  assertExecutionAllowed,
  getTradingConfig
} from "../config/TradingConfig.js";
import type {
  DashboardSignalResponse
} from "../services/StrategyDashboardService.js";
import {
  StrategyDashboardService
} from "../services/StrategyDashboardService.js";
import type {
  AlpacaAccount,
  AlpacaClock,
  AlpacaOrder
} from "../broker/AlpacaTradingTypes.js";

export interface SignalRunResult {
  success: boolean;
  message: string;
  signal?: DashboardSignalResponse;
}

export interface PaperTradeRunResult {
  success: boolean;
  message: string;
  mode: "dry-run" | "execute" | "offline";
  signal?: DashboardSignalResponse;
  plan?: PaperTradePlan;
  planText?: string;
  referencePrice?: number | null;
  orders?: AlpacaOrder[];
}

export interface PaperTradeRunOptions {
  execute?: boolean;
  offline?: boolean;
  force?: boolean;
  date?: string;
}

export class PaperTradingRunner {
  private readonly dashboard =
    new StrategyDashboardService();

  private readonly alpacaConfig =
    getAlpacaConfig();

  private readonly tradingConfig =
    getTradingConfig();

  private readonly client =
    new AlpacaTradingClient(
      this.alpacaConfig
    );

  async runSignal(
    options: { date?: string } = {}
  ): Promise<SignalRunResult> {
    try {
      const savedState = loadSignalState(
        this.tradingConfig.signalStatePath
      );

      const signal =
        await this.dashboard.getSignal({
          ...(options.date
            ? { date: options.date }
            : {}),
          heldSymbol:
            savedState?.symbol ?? null,
          heldSinceDay:
            savedState?.since ?? null
        });

      if (
        signal.action === "buy" ||
        signal.action === "rotate"
      ) {
        if (signal.targetSymbol) {
          saveSignalState(
            this.tradingConfig.signalStatePath,
            {
              symbol: signal.targetSymbol,
              since: signal.signalDate
            }
          );
        }
      } else if (
        signal.action === "exit" ||
        signal.action === "stay_cash"
      ) {
        saveSignalState(
          this.tradingConfig.signalStatePath,
          null
        );
      }

      return {
        success: true,
        message: `${signal.action.toUpperCase()} — ${signal.reason}`,
        signal
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Signal run failed"
      };
    }
  }

  async runPaperTrade(
    options: PaperTradeRunOptions = {}
  ): Promise<PaperTradeRunResult> {
    const execute = options.execute ?? false;
    const offline = options.offline ?? false;
    const force = options.force ?? false;
    const dryRun =
      !execute || offline;

    const mode: PaperTradeRunResult["mode"] =
      offline
        ? "offline"
        : execute
          ? "execute"
          : "dry-run";

    try {
      let account: Pick<
        AlpacaAccount,
        "buying_power"
      >;
      let holdings: BrokerHoldings;
      let clock: AlpacaClock | null = null;

      const savedState = loadSignalState(
        this.tradingConfig.signalStatePath
      );

      if (offline) {
        account = {
          buying_power: String(
            DEFAULT_INITIAL_CASH
          )
        };

        if (savedState) {
          const heldPrice =
            await this.dashboard.getLatestClose(
              savedState.symbol
            );

          holdings = {
            symbol: savedState.symbol,
            qty: heldPrice
              ? calculateBuyQty(
                  DEFAULT_INITIAL_CASH,
                  heldPrice,
                  this.tradingConfig
                    .cashReservePercent
                )
              : 0
          };
        } else {
          holdings = {
            symbol: null,
            qty: 0
          };
        }
      } else {
        const [
          brokerAccount,
          positions,
          marketClock
        ] = await Promise.all([
          this.client.getAccount(),
          this.client.getPositions(),
          this.client.getClock()
        ]);

        account = brokerAccount;
        clock = marketClock;
        holdings =
          resolveBrokerHoldings(positions);
      }

      if (
        clock &&
        !clock.is_open &&
        !force &&
        !dryRun
      ) {
        return {
          success: false,
          mode,
          message:
            "Market is closed. Trade skipped."
        };
      }

      const heldSymbol =
        holdings.symbol ??
        savedState?.symbol ??
        null;

      const heldSinceDay =
        heldSymbol &&
        savedState?.symbol === heldSymbol
          ? savedState.since
          : null;

      const signal =
        await this.dashboard.getSignal({
          ...(options.date
            ? { date: options.date }
            : {}),
          heldSymbol,
          heldSinceDay
        });

      const referencePrice =
        signal.targetSymbol
          ? await this.dashboard.getLatestClose(
              signal.targetSymbol
            )
          : holdings.symbol
            ? await this.dashboard.getLatestClose(
                holdings.symbol
              )
            : null;

      const plan = buildPaperTradePlan(
        signal,
        account,
        holdings,
        referencePrice,
        this.tradingConfig
      );

      const planText =
        formatPaperTradePlan(plan);

      if (plan.noTrade) {
        return {
          success: true,
          mode,
          message:
            plan.noTradeReason ??
            "No trade required",
          signal,
          plan,
          planText,
          referencePrice
        };
      }

      if (dryRun) {
        return {
          success: true,
          mode,
          message: `Dry run — ${plan.steps.length} planned order(s)`,
          signal,
          plan,
          planText,
          referencePrice
        };
      }

      assertExecutionAllowed(
        this.alpacaConfig,
        this.tradingConfig
      );

      const orders = await this.executePlan(
        plan,
        referencePrice
      );

      this.syncSignalState(signal);

      return {
        success: true,
        mode,
        message: `Submitted ${orders.length} order(s)`,
        signal,
        plan,
        planText,
        referencePrice,
        orders
      };
    } catch (error) {
      if (error instanceof AlpacaTradingError) {
        return {
          success: false,
          mode,
          message: error.message
        };
      }

      return {
        success: false,
        mode,
        message:
          error instanceof Error
            ? error.message
            : "Paper trade run failed"
      };
    }
  }

  private async executePlan(
    plan: PaperTradePlan,
    referencePrice: number | null
  ): Promise<AlpacaOrder[]> {
    const submittedOrders: AlpacaOrder[] = [];

    for (const step of plan.steps) {
      if (step.side === "sell") {
        submittedOrders.push(
          await this.client.closePosition(
            step.symbol
          )
        );
        continue;
      }

      const freshAccount =
        await this.client.getAccount();

      const buyPrice =
        (await this.dashboard.getLatestClose(
          step.symbol
        )) ??
        referencePrice ??
        0;

      const buyQty = calculateBuyQty(
        Number(freshAccount.buying_power),
        buyPrice,
        this.tradingConfig.cashReservePercent
      );

      if (buyQty <= 0) {
        throw new Error(
          `Insufficient buying power for ${step.symbol}`
        );
      }

      submittedOrders.push(
        await this.client.createOrder({
          symbol: step.symbol,
          qty: String(buyQty),
          side: "buy",
          type: "market",
          time_in_force: "day"
        })
      );
    }

    return submittedOrders;
  }

  private syncSignalState(
    signal: DashboardSignalResponse
  ): void {
    if (
      signal.action === "buy" ||
      signal.action === "rotate"
    ) {
      const nextState = signalStateAfterAction(
        signal.action,
        signal.signalDate,
        signal.targetSymbol
      );

      if (nextState) {
        saveSignalState(
          this.tradingConfig.signalStatePath,
          nextState
        );
      }

      return;
    }

    if (
      signal.action === "exit" ||
      signal.action === "stay_cash"
    ) {
      saveSignalState(
        this.tradingConfig.signalStatePath,
        null
      );
    }
  }
}
