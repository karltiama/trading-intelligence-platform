import { Injectable } from '@nestjs/common';
import { PaperOrderSide, Prisma } from '@prisma/client';
import { MarketDataRepository } from '../market-data/market-data.repository';
import { MarketDataService } from '../market-data/market-data.service';
import { PaperTradingRepository } from '../paper-trading/paper-trading.repository';

const MAX_ORDER_QUANTITY = new Prisma.Decimal(1000);
const MAX_POSITION_QUANTITY = new Prisma.Decimal(2000);
const MAX_ORDER_NOTIONAL = new Prisma.Decimal(50000);
const MAX_RISK_PER_TRADE_PERCENT = new Prisma.Decimal('0.01');
const MAX_PORTFOLIO_HEAT_PERCENT = new Prisma.Decimal('0.06');

export type RiskCheckInput = {
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
  userEmail: string;
  accountId?: string;
};

export type RiskCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
    };

export type TradeRiskInput = {
  entryPrice: Prisma.Decimal;
  stopLossPrice: Prisma.Decimal | null;
  takeProfitPrice?: Prisma.Decimal | null;
  quantity: Prisma.Decimal;
  equity: Prisma.Decimal;
};

export type TradeRiskResult =
  | {
      allowed: true;
      riskPerShare: Prisma.Decimal;
      totalRisk: Prisma.Decimal;
      riskPercent: Prisma.Decimal;
      riskRewardRatio: Prisma.Decimal | null;
    }
  | { allowed: false; reason: string };

@Injectable()
export class RiskService {
  constructor(
    private readonly paperTradingRepository: PaperTradingRepository,
    private readonly marketDataService: MarketDataService,
    private readonly marketDataRepository: MarketDataRepository,
  ) {}

  async evaluateOrder(input: RiskCheckInput): Promise<RiskCheckResult> {
    const quantity = new Prisma.Decimal(input.quantity);
    if (quantity.lte(0)) {
      return { allowed: false, reason: 'quantity must be positive' };
    }
    if (quantity.gt(MAX_ORDER_QUANTITY)) {
      return {
        allowed: false,
        reason: `quantity exceeds max per order (${MAX_ORDER_QUANTITY.toString()})`,
      };
    }

    const account = await this.paperTradingRepository.resolveAccountForUser({
      userEmail: input.userEmail,
      accountId: input.accountId,
    });
    if (!account) {
      return {
        allowed: false,
        reason: 'paper account not found for current user',
      };
    }
    const mark = await this.marketDataService.resolveSymbolMarkPrice(
      input.symbol,
    );
    if (!mark) {
      return { allowed: false, reason: `symbol not tracked: ${input.symbol}` };
    }

    const currentPosition = await this.paperTradingRepository.findPosition(
      account.id,
      mark.symbolId,
    );
    const notional = new Prisma.Decimal(mark.close).mul(quantity);
    if (notional.gt(MAX_ORDER_NOTIONAL)) {
      return {
        allowed: false,
        reason: `order notional exceeds max (${MAX_ORDER_NOTIONAL.toString()})`,
      };
    }

    if (input.side === 'BUY') {
      if (account.cashBalance.lt(notional)) {
        return { allowed: false, reason: 'insufficient cash balance' };
      }
      const projectedQty = currentPosition
        ? currentPosition.quantity.add(quantity)
        : quantity;
      if (projectedQty.gt(MAX_POSITION_QUANTITY)) {
        return {
          allowed: false,
          reason: `position size exceeds max (${MAX_POSITION_QUANTITY.toString()})`,
        };
      }
      return { allowed: true };
    }

    const heldQuantity = currentPosition?.quantity ?? new Prisma.Decimal(0);
    if (heldQuantity.lt(quantity)) {
      return {
        allowed: false,
        reason: 'short selling is disabled: insufficient held quantity',
      };
    }

    return { allowed: true };
  }

  /**
   * Account equity = cash + open positions marked to their latest price.
   * This is the correct base for per-trade risk sizing (cash alone shrinks as
   * capital is deployed). Marking mirrors PortfolioService. Returns null when
   * the account cannot be resolved for the user.
   */
  async resolveAccountEquity(
    userEmail: string,
    accountId?: string,
  ): Promise<Prisma.Decimal | null> {
    const account = await this.paperTradingRepository.resolveAccountForUser({
      userEmail,
      accountId,
    });
    if (!account) {
      return null;
    }

    const positions = await this.paperTradingRepository.listPositions(
      account.id,
    );
    const openPositions = positions.filter((position) =>
      position.quantity.gt(0),
    );
    if (openPositions.length === 0) {
      return account.cashBalance;
    }

    await this.marketDataService.ensureHourlyBarsForSymbols(
      openPositions.map((position) => position.symbol),
    );
    const marks =
      await this.marketDataRepository.findLatestMarkPricesForSymbols(
        openPositions.map((position) => position.symbolId),
      );

    let positionsValue = new Prisma.Decimal(0);
    for (const position of openPositions) {
      const mark = marks[position.symbolId];
      if (mark) {
        positionsValue = positionsValue.add(mark.close.mul(position.quantity));
      }
    }

    return account.cashBalance.add(positionsValue);
  }

  /**
   * Pure R-based risk check for a long entry. Callers resolve entry (mark)
   * price, account equity, and quantity, then delegate the sizing decision
   * here so manual and automation paths share identical math.
   */
  evaluateTradeRisk(input: TradeRiskInput): TradeRiskResult {
    if (input.stopLossPrice === null) {
      return {
        allowed: false,
        reason:
          'stopLossPrice is required and must be a valid number for BUY orders.',
      };
    }
    if (input.stopLossPrice.gte(input.entryPrice)) {
      return {
        allowed: false,
        reason: `stopLossPrice must be below reference price (${input.entryPrice.toFixed(2)}).`,
      };
    }

    const riskPerShare = input.entryPrice.sub(input.stopLossPrice);
    const totalRisk = riskPerShare.mul(input.quantity);
    if (totalRisk.lte(0)) {
      return { allowed: false, reason: 'totalRisk must be greater than 0.' };
    }
    if (input.equity.lte(0)) {
      return {
        allowed: false,
        reason: 'account equity must be greater than 0.',
      };
    }

    const riskPercent = totalRisk.div(input.equity);
    if (riskPercent.gt(MAX_RISK_PER_TRADE_PERCENT)) {
      return {
        allowed: false,
        reason: `Risk per trade exceeds limit (${MAX_RISK_PER_TRADE_PERCENT.mul(
          100,
        ).toFixed(2)}%).`,
      };
    }

    let riskRewardRatio: Prisma.Decimal | null = null;
    if (input.takeProfitPrice != null) {
      const rewardPerShare = input.takeProfitPrice.sub(input.entryPrice);
      if (rewardPerShare.gt(0)) {
        riskRewardRatio = rewardPerShare.div(riskPerShare);
      }
    }

    return {
      allowed: true,
      riskPerShare,
      totalRisk,
      riskPercent,
      riskRewardRatio,
    };
  }

  /**
   * Convenience long-entry risk check that resolves the entry mark price and
   * account equity, then applies the R-based rule. Used by callers (e.g.
   * automation) that only have the order intent, not the resolved inputs.
   */
  async evaluateLongEntryRisk(input: {
    symbol: string;
    quantity: number;
    stopLossPrice?: number | null;
    takeProfitPrice?: number | null;
    userEmail: string;
    accountId?: string;
  }): Promise<TradeRiskResult> {
    const mark = await this.marketDataService.resolveSymbolMarkPrice(
      input.symbol,
    );
    if (!mark) {
      return { allowed: false, reason: `symbol not tracked: ${input.symbol}` };
    }

    const equity = await this.resolveAccountEquity(
      input.userEmail,
      input.accountId,
    );
    if (equity === null) {
      return {
        allowed: false,
        reason: 'paper account not found for current user',
      };
    }

    const perTrade = this.evaluateTradeRisk({
      entryPrice: new Prisma.Decimal(mark.close),
      stopLossPrice:
        input.stopLossPrice == null
          ? null
          : new Prisma.Decimal(input.stopLossPrice),
      takeProfitPrice:
        input.takeProfitPrice == null
          ? null
          : new Prisma.Decimal(input.takeProfitPrice),
      quantity: new Prisma.Decimal(input.quantity),
      equity,
    });
    if (!perTrade.allowed) {
      return perTrade;
    }

    const heat = await this.evaluatePortfolioHeat({
      userEmail: input.userEmail,
      accountId: input.accountId,
      equity,
      newTradeRisk: perTrade.totalRisk,
    });
    if (!heat.allowed) {
      return { allowed: false, reason: heat.reason };
    }

    return perTrade;
  }

  /**
   * Portfolio-heat guard: total open risk across stop-protected positions plus
   * the prospective trade's risk must stay within MAX_PORTFOLIO_HEAT_PERCENT of
   * equity. Caps how many simultaneous full-risk trades can be open at once.
   */
  async evaluatePortfolioHeat(input: {
    userEmail: string;
    accountId?: string;
    equity: Prisma.Decimal;
    newTradeRisk: Prisma.Decimal;
  }): Promise<RiskCheckResult> {
    if (input.equity.lte(0)) {
      return {
        allowed: false,
        reason: 'account equity must be greater than 0.',
      };
    }
    const account = await this.paperTradingRepository.resolveAccountForUser({
      userEmail: input.userEmail,
      accountId: input.accountId,
    });
    if (!account) {
      return {
        allowed: false,
        reason: 'paper account not found for current user',
      };
    }

    const openRisk = await this.resolveOpenRisk(account.id);
    const projectedHeat = openRisk.add(input.newTradeRisk).div(input.equity);
    if (projectedHeat.gt(MAX_PORTFOLIO_HEAT_PERCENT)) {
      return {
        allowed: false,
        reason: `Portfolio risk heat exceeds limit (${MAX_PORTFOLIO_HEAT_PERCENT.mul(
          100,
        ).toFixed(2)}%).`,
      };
    }

    return { allowed: true };
  }

  /**
   * Sum of currently open dollar risk = Σ max(0, mark − stop) × qty over open
   * positions that have a protective stop. Stopless positions are excluded
   * (they are governed by the per-trade stop requirement on new entries).
   */
  async resolveOpenRisk(accountId: string): Promise<Prisma.Decimal> {
    const positions = await this.paperTradingRepository.listPositions(
      accountId,
    );
    const openPositions = positions.filter((position) =>
      position.quantity.gt(0),
    );
    if (openPositions.length === 0) {
      return new Prisma.Decimal(0);
    }

    const symbolIds = openPositions.map((position) => position.symbolId);
    const [orderLevels, marks] = await Promise.all([
      this.paperTradingRepository.findLatestFilledBuyOrdersForSymbols(
        accountId,
        symbolIds,
      ),
      this.marketDataRepository.findLatestMarkPricesForSymbols(symbolIds),
    ]);

    let total = new Prisma.Decimal(0);
    for (const position of openPositions) {
      const stopLossPrice = orderLevels[position.symbolId]?.stopLossPrice;
      const mark = marks[position.symbolId];
      if (stopLossPrice == null || !mark) {
        continue;
      }
      const riskPerShare = mark.close.sub(new Prisma.Decimal(stopLossPrice));
      if (riskPerShare.gt(0)) {
        total = total.add(riskPerShare.mul(position.quantity));
      }
    }
    return total;
  }
}
