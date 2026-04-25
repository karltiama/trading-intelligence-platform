import { Injectable } from '@nestjs/common';
import { PaperOrderSide, Prisma } from '@prisma/client';
import { PaperTradingRepository } from '../paper-trading/paper-trading.repository';

const MAX_ORDER_QUANTITY = new Prisma.Decimal(1000);
const MAX_POSITION_QUANTITY = new Prisma.Decimal(2000);
const MAX_ORDER_NOTIONAL = new Prisma.Decimal(50000);

export type RiskCheckInput = {
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
};

export type RiskCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
    };

@Injectable()
export class RiskService {
  constructor(private readonly paperTradingRepository: PaperTradingRepository) {}

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

    const account = await this.paperTradingRepository.getOrCreateDefaultAccount();
    const quote = await this.paperTradingRepository.findSymbolQuote(input.symbol);
    if (!quote) {
      return { allowed: false, reason: `symbol not tracked: ${input.symbol}` };
    }
    if (!quote.latestClose) {
      return {
        allowed: false,
        reason: `no latest market price available: ${input.symbol}`,
      };
    }

    const currentPosition = await this.paperTradingRepository.findPosition(
      account.id,
      quote.symbolId,
    );
    const notional = quote.latestClose.mul(quantity);
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
}
