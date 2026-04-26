import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaperOrderSide, PaperOrderStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  PaperTradingRepository,
  type PaperOrderListFilters,
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

export type PaperOrderPage = {
  items: PaperOrderListItem[];
  nextCursor: { requestedAt: string; orderId: string } | null;
};

@Injectable()
export class PaperTradingService {
  constructor(
    private readonly paperTradingRepository: PaperTradingRepository,
    private readonly auditService: AuditService,
  ) {}

  async placeMarketOrder(
    input: PlaceMarketOrderInput,
    userEmail: string,
    accountId?: string,
  ): Promise<PlaceMarketOrderResult> {
    const ticker = this.normalizeTicker(input.symbol);
    const quantity = this.toPositiveQuantity(input.quantity);

    const account = await this.resolveScopedAccount(userEmail, accountId);
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
      const placed = await this.executeBuy({
        accountId: account.id,
        ticker,
        symbolId: symbolQuote.symbolId,
        quantity,
        fillPrice,
        fillNotional,
        cashBalance: account.cashBalance,
        existingPosition,
      });
      await this.recordOrderPlacedAudit({
        userEmail,
        accountId: account.id,
        order: placed,
      });
      return placed;
    }

    const placed = await this.executeSell({
      accountId: account.id,
      ticker,
      symbolId: symbolQuote.symbolId,
      quantity,
      fillPrice,
      fillNotional,
      cashBalance: account.cashBalance,
      existingPosition,
    });
    await this.recordOrderPlacedAudit({
      userEmail,
      accountId: account.id,
      order: placed,
    });
    return placed;
  }

  async cancelOrder(
    orderId: string,
    userEmail: string,
    accountId?: string,
  ): Promise<{ orderId: string; status: 'CANCELED' }> {
    const account = await this.resolveScopedAccount(userEmail, accountId);
    const existing = await this.paperTradingRepository.findOrderForAccount(
      account.id,
      orderId,
    );
    if (!existing) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }
    if (existing.status !== 'NEW') {
      throw new ConflictException(
        `Order ${orderId} cannot be canceled from status ${existing.status}.`,
      );
    }

    const canceled = await this.paperTradingRepository.cancelNewOrderForAccount(
      account.id,
      orderId,
    );
    if (!canceled) {
      throw new ConflictException(`Order ${orderId} is no longer cancelable.`);
    }

    return { orderId, status: 'CANCELED' };
  }

  async listOrders(
    userEmail: string,
    filters: PaperOrderListFilters = {},
    accountId?: string,
  ): Promise<PaperOrderListItem[]> {
    const account = await this.resolveScopedAccount(userEmail, accountId);
    const rows = await this.paperTradingRepository.listOrders(account.id, filters);
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

  async listOrdersPage(input: {
    userEmail: string;
    accountId?: string;
    symbol?: string;
    status?: PaperOrderStatus;
    limit: number;
    cursor?: { requestedAt: Date; orderId: string };
  }): Promise<PaperOrderPage> {
    const account = await this.resolveScopedAccount(input.userEmail, input.accountId);
    const rows = await this.paperTradingRepository.listOrders(account.id, {
      symbol: input.symbol,
      status: input.status,
      limit: input.limit + 1,
      cursorRequestedAt: input.cursor?.requestedAt,
      cursorOrderId: input.cursor?.orderId,
    });

    const hasMore = rows.length > input.limit;
    const visibleRows = hasMore ? rows.slice(0, input.limit) : rows;
    const items = visibleRows.map((row) => ({
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

    const last = visibleRows[visibleRows.length - 1];
    const nextCursor =
      hasMore && last
        ? { requestedAt: last.requestedAt.toISOString(), orderId: last.id }
        : null;

    return { items, nextCursor };
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

  private async resolveScopedAccount(
    userEmail: string,
    accountId?: string,
  ): Promise<{ id: string; cashBalance: Prisma.Decimal; currency: string }> {
    const account = await this.paperTradingRepository.resolveAccountForUser({
      userEmail,
      accountId,
    });
    if (!account) {
      throw new NotFoundException(
        accountId
          ? `Paper account not found for current user: ${accountId}`
          : 'Paper account not found for current user.',
      );
    }
    return account;
  }

  private async recordOrderPlacedAudit(params: {
    userEmail: string;
    accountId: string;
    order: PlaceMarketOrderResult;
  }): Promise<void> {
    await this.auditService.recordEvent({
      eventType: 'ORDER_PLACED',
      userEmail: params.userEmail,
      accountId: params.accountId,
      resourceId: params.order.orderId,
      payload: {
        symbol: params.order.symbol,
        side: params.order.side,
        status: params.order.status,
        quantity: params.order.quantity,
        fillPrice: params.order.fillPrice,
        fillNotional: params.order.fillNotional,
        cashBalance: params.order.cashBalance,
      },
    });
  }
}
