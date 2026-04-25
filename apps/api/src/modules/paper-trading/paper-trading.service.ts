import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaperOrderSide, PaperOrderStatus, Prisma } from '@prisma/client';
import {
  PaperTradingRepository,
  type PaperPositionState,
} from './paper-trading.repository';

export type PlaceMarketOrderInput = {
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
};

export type PlaceMarketOrderResult = {
  orderId: string;
  status: PaperOrderStatus;
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
  fillPrice: number;
  fillNotional: number;
  cashBalance: number;
};

export type PaperOrderListItem = {
  orderId: string;
  symbol: string;
  side: PaperOrderSide;
  type: 'MARKET';
  status: PaperOrderStatus;
  quantity: number;
  requestedAt: string;
  filledAt: string | null;
  canceledAt: string | null;
};

@Injectable()
export class PaperTradingService {
  constructor(private readonly paperTradingRepository: PaperTradingRepository) {}

  async placeMarketOrder(
    input: PlaceMarketOrderInput,
  ): Promise<PlaceMarketOrderResult> {
    const ticker = this.normalizeTicker(input.symbol);
    const quantity = this.toPositiveQuantity(input.quantity);

    const account = await this.paperTradingRepository.getOrCreateDefaultAccount();
    const symbolQuote = await this.paperTradingRepository.findSymbolQuote(ticker);
    if (!symbolQuote) {
      throw new NotFoundException(`Tracked symbol not found: ${ticker}`);
    }
    if (symbolQuote.latestClose === null) {
      throw new ConflictException(`No latest market price available for ${ticker}`);
    }

    const fillPrice = symbolQuote.latestClose;
    const fillNotional = fillPrice.mul(quantity);
    const existingPosition = await this.paperTradingRepository.findPosition(
      account.id,
      symbolQuote.symbolId,
    );

    if (input.side === 'BUY') {
      return this.executeBuy({
        accountId: account.id,
        ticker,
        symbolId: symbolQuote.symbolId,
        quantity,
        fillPrice,
        fillNotional,
        cashBalance: account.cashBalance,
        existingPosition,
      });
    }

    return this.executeSell({
      accountId: account.id,
      ticker,
      symbolId: symbolQuote.symbolId,
      quantity,
      fillPrice,
      fillNotional,
      cashBalance: account.cashBalance,
      existingPosition,
    });
  }

  async cancelOrder(orderId: string): Promise<{ orderId: string; status: 'CANCELED' }> {
    const existing = await this.paperTradingRepository.findOrder(orderId);
    if (!existing) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }
    if (existing.status !== 'NEW') {
      throw new ConflictException(
        `Order ${orderId} cannot be canceled from status ${existing.status}.`,
      );
    }

    const canceled = await this.paperTradingRepository.cancelNewOrder(orderId);
    if (!canceled) {
      throw new ConflictException(`Order ${orderId} is no longer cancelable.`);
    }

    return { orderId, status: 'CANCELED' };
  }

  async listOrders(): Promise<PaperOrderListItem[]> {
    const rows = await this.paperTradingRepository.listOrders();
    return rows.map((row) => ({
      orderId: row.id,
      symbol: row.symbol,
      side: row.side,
      type: row.type,
      status: row.status,
      quantity: row.quantity.toNumber(),
      requestedAt: row.requestedAt.toISOString(),
      filledAt: row.filledAt?.toISOString() ?? null,
      canceledAt: row.canceledAt?.toISOString() ?? null,
    }));
  }

  private async executeBuy(params: {
    accountId: string;
    ticker: string;
    symbolId: string;
    quantity: Prisma.Decimal;
    fillPrice: Prisma.Decimal;
    fillNotional: Prisma.Decimal;
    cashBalance: Prisma.Decimal;
    existingPosition: PaperPositionState | null;
  }): Promise<PlaceMarketOrderResult> {
    if (params.cashBalance.lessThan(params.fillNotional)) {
      throw new ConflictException('Insufficient cash balance for BUY market order.');
    }

    const nextCashBalance = params.cashBalance.sub(params.fillNotional);
    const nextPosition =
      params.existingPosition === null
        ? {
            quantity: params.quantity,
            averageCost: params.fillPrice,
            realizedPnl: new Prisma.Decimal(0),
          }
        : this.mergeBuyPosition(
            params.existingPosition,
            params.quantity,
            params.fillPrice,
          );

    const created = await this.paperTradingRepository.createFilledOrder({
      accountId: params.accountId,
      symbolId: params.symbolId,
      side: 'BUY',
      quantity: params.quantity,
      price: params.fillPrice,
      notional: params.fillNotional,
    });
    await this.paperTradingRepository.updateAccountCash(
      params.accountId,
      nextCashBalance,
    );
    await this.paperTradingRepository.upsertPosition({
      accountId: params.accountId,
      symbolId: params.symbolId,
      quantity: nextPosition.quantity,
      averageCost: nextPosition.averageCost,
      realizedPnl: nextPosition.realizedPnl,
    });

    return {
      orderId: created.orderId,
      status: 'FILLED',
      symbol: params.ticker,
      side: 'BUY',
      quantity: params.quantity.toNumber(),
      fillPrice: params.fillPrice.toNumber(),
      fillNotional: params.fillNotional.toNumber(),
      cashBalance: nextCashBalance.toNumber(),
    };
  }

  private async executeSell(params: {
    accountId: string;
    ticker: string;
    symbolId: string;
    quantity: Prisma.Decimal;
    fillPrice: Prisma.Decimal;
    fillNotional: Prisma.Decimal;
    cashBalance: Prisma.Decimal;
    existingPosition: PaperPositionState | null;
  }): Promise<PlaceMarketOrderResult> {
    if (
      params.existingPosition === null ||
      params.existingPosition.quantity.lessThan(params.quantity)
    ) {
      throw new ConflictException('Short selling is disabled for this paper account.');
    }

    const nextCashBalance = params.cashBalance.add(params.fillNotional);
    const remainingQuantity = params.existingPosition.quantity.sub(params.quantity);
    const realizedDelta = params.fillPrice
      .sub(params.existingPosition.averageCost)
      .mul(params.quantity);

    const nextAverageCost = remainingQuantity.equals(0)
      ? new Prisma.Decimal(0)
      : params.existingPosition.averageCost;

    const created = await this.paperTradingRepository.createFilledOrder({
      accountId: params.accountId,
      symbolId: params.symbolId,
      side: 'SELL',
      quantity: params.quantity,
      price: params.fillPrice,
      notional: params.fillNotional,
    });
    await this.paperTradingRepository.updateAccountCash(
      params.accountId,
      nextCashBalance,
    );
    await this.paperTradingRepository.upsertPosition({
      accountId: params.accountId,
      symbolId: params.symbolId,
      quantity: remainingQuantity,
      averageCost: nextAverageCost,
      realizedPnl: params.existingPosition.realizedPnl.add(realizedDelta),
    });

    return {
      orderId: created.orderId,
      status: 'FILLED',
      symbol: params.ticker,
      side: 'SELL',
      quantity: params.quantity.toNumber(),
      fillPrice: params.fillPrice.toNumber(),
      fillNotional: params.fillNotional.toNumber(),
      cashBalance: nextCashBalance.toNumber(),
    };
  }

  private normalizeTicker(symbol: string): string {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('symbol is required.');
    }
    return normalized;
  }

  private toPositiveQuantity(quantity: number): Prisma.Decimal {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity must be a positive number.');
    }
    return new Prisma.Decimal(quantity);
  }

  private mergeBuyPosition(
    existing: PaperPositionState,
    quantity: Prisma.Decimal,
    fillPrice: Prisma.Decimal,
  ): {
    quantity: Prisma.Decimal;
    averageCost: Prisma.Decimal;
    realizedPnl: Prisma.Decimal;
  } {
    const nextQuantity = existing.quantity.add(quantity);
    const weightedCost = existing.averageCost
      .mul(existing.quantity)
      .add(fillPrice.mul(quantity))
      .div(nextQuantity);

    return {
      quantity: nextQuantity,
      averageCost: weightedCost,
      realizedPnl: existing.realizedPnl,
    };
  }
}
