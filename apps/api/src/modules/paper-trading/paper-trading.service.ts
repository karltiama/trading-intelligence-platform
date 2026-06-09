import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaperOrderSide,
  PaperOrderStatus,
  Prisma,
  TradeSource,
  UniverseType,
} from '@prisma/client';
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
  source: TradeSource;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  /** Required when source is SIGNAL; optional for AUTOMATION scanner-linked orders. */
  signalId?: string;
  note?: string | null;
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
  signalId: string | null;
  source: TradeSource;
  note: string | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
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
  signalId: string | null;
  source: TradeSource;
  note: string | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  fillPrice: number | null;
  symbolUniverseType: UniverseType;
  tradeRationale: {
    strategyName: string | null;
    reason: string;
    confidence: number | null;
    entryPrice: number | null;
    stopLoss: number | null;
    targetPrice: number | null;
  } | null;
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
    const symbolQuote =
      await this.paperTradingRepository.findSymbolQuote(ticker);
    if (!symbolQuote) {
      throw new NotFoundException(`Tracked symbol not found: ${ticker}`);
    }
    if (symbolQuote.latestClose === null) {
      throw new ConflictException(
        `No latest market price available for ${ticker}`,
      );
    }

    let linkedSignalId: string | null = null;
    if (input.source === TradeSource.SIGNAL) {
      const trimmedSignalId = input.signalId?.trim();
      if (!trimmedSignalId) {
        throw new BadRequestException(
          'signalId is required for SIGNAL orders.',
        );
      }
      const link =
        await this.paperTradingRepository.findSignalSymbolLink(trimmedSignalId);
      if (!link) {
        throw new BadRequestException(`Signal not found: ${trimmedSignalId}`);
      }
      if (link.symbolId !== symbolQuote.symbolId) {
        throw new BadRequestException('signalId does not match order symbol.');
      }
      linkedSignalId = link.id;
    } else if (input.source === TradeSource.MANUAL) {
      if (input.signalId?.trim()) {
        throw new BadRequestException(
          'signalId is not allowed for MANUAL orders.',
        );
      }
    } else if (input.source === TradeSource.AUTOMATION) {
      const trimmedSignalId = input.signalId?.trim();
      if (trimmedSignalId) {
        const link =
          await this.paperTradingRepository.findSignalSymbolLink(
            trimmedSignalId,
          );
        if (!link) {
          throw new BadRequestException(`Signal not found: ${trimmedSignalId}`);
        }
        if (link.symbolId !== symbolQuote.symbolId) {
          throw new BadRequestException('signalId does not match order symbol.');
        }
        linkedSignalId = link.id;
      }
    }

    const note = input.note?.trim() ? input.note.trim() : null;
    const stopLossPrice =
      input.stopLossPrice == null
        ? null
        : new Prisma.Decimal(input.stopLossPrice);
    const takeProfitPrice =
      input.takeProfitPrice == null
        ? null
        : new Prisma.Decimal(input.takeProfitPrice);

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
        signalId: linkedSignalId,
        source: input.source,
        note,
        stopLossPrice,
        takeProfitPrice,
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
      signalId: linkedSignalId,
      source: input.source,
      note,
      stopLossPrice,
      takeProfitPrice,
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

  async updateOrderLevels(
    orderId: string,
    input: {
      stopLossPrice?: number;
      takeProfitPrice?: number;
    },
    userEmail: string,
    accountId?: string,
  ): Promise<{
    orderId: string;
    stopLossPrice: number | null;
    takeProfitPrice: number | null;
  }> {
    if (
      input.stopLossPrice === undefined &&
      input.takeProfitPrice === undefined
    ) {
      throw new BadRequestException(
        'at least one of stopLossPrice or takeProfitPrice is required.',
      );
    }
    if (
      input.stopLossPrice !== undefined &&
      !Number.isFinite(input.stopLossPrice)
    ) {
      throw new BadRequestException('stopLossPrice must be a valid number.');
    }
    if (
      input.takeProfitPrice !== undefined &&
      !Number.isFinite(input.takeProfitPrice)
    ) {
      throw new BadRequestException('takeProfitPrice must be a valid number.');
    }

    const account = await this.resolveScopedAccount(userEmail, accountId);
    const existing = await this.paperTradingRepository.findOrderLevelsRow(
      account.id,
      orderId,
    );
    if (!existing) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }
    if (existing.status !== 'FILLED' || existing.side !== 'BUY') {
      throw new BadRequestException(
        'only filled BUY orders support stop/target edits.',
      );
    }
    if (!existing.fillPrice) {
      throw new BadRequestException(
        `Order ${orderId} has no fill price for level validation.`,
      );
    }

    const fillPrice = existing.fillPrice.toNumber();
    const stopLossPrice =
      input.stopLossPrice ??
      (existing.stopLossPrice ? existing.stopLossPrice.toNumber() : null);
    const takeProfitPrice =
      input.takeProfitPrice ??
      (existing.takeProfitPrice ? existing.takeProfitPrice.toNumber() : null);

    if (stopLossPrice === null) {
      throw new BadRequestException(
        'stopLossPrice is required when order has no existing stop.',
      );
    }
    if (stopLossPrice >= fillPrice) {
      throw new BadRequestException(
        `stopLossPrice must be below fill price (${fillPrice.toFixed(2)}).`,
      );
    }
    if (takeProfitPrice !== null && takeProfitPrice <= fillPrice) {
      throw new BadRequestException(
        `takeProfitPrice must be above fill price (${fillPrice.toFixed(2)}).`,
      );
    }

    const updated = await this.paperTradingRepository.updateFilledBuyOrderLevels(
      account.id,
      orderId,
      {
        stopLossPrice: new Prisma.Decimal(stopLossPrice),
        takeProfitPrice:
          takeProfitPrice === null
            ? null
            : new Prisma.Decimal(takeProfitPrice),
      },
    );
    if (!updated) {
      throw new ConflictException(`Order ${orderId} levels could not be updated.`);
    }

    return {
      orderId,
      stopLossPrice,
      takeProfitPrice,
    };
  }

  async listOrders(
    userEmail: string,
    filters: PaperOrderListFilters = {},
    accountId?: string,
  ): Promise<PaperOrderListItem[]> {
    const account = await this.resolveScopedAccount(userEmail, accountId);
    const rows = await this.paperTradingRepository.listOrders(
      account.id,
      filters,
    );
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
      signalId: row.signalId,
      source: row.source,
      note: row.note,
      stopLossPrice: row.stopLossPrice ? row.stopLossPrice.toNumber() : null,
      takeProfitPrice: row.takeProfitPrice
        ? row.takeProfitPrice.toNumber()
        : null,
      fillPrice: row.fillPrice ? row.fillPrice.toNumber() : null,
      symbolUniverseType: row.symbolUniverseType,
      tradeRationale: row.tradeRationale,
    }));
  }

  async listOrdersPage(input: {
    userEmail: string;
    accountId?: string;
    symbol?: string;
    signalId?: string;
    status?: PaperOrderStatus;
    limit: number;
    cursor?: { requestedAt: Date; orderId: string };
  }): Promise<PaperOrderPage> {
    const account = await this.resolveScopedAccount(
      input.userEmail,
      input.accountId,
    );
    const rows = await this.paperTradingRepository.listOrders(account.id, {
      symbol: input.symbol,
      signalId: input.signalId,
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
      signalId: row.signalId,
      source: row.source,
      note: row.note,
      stopLossPrice: row.stopLossPrice ? row.stopLossPrice.toNumber() : null,
      takeProfitPrice: row.takeProfitPrice
        ? row.takeProfitPrice.toNumber()
        : null,
      fillPrice: row.fillPrice ? row.fillPrice.toNumber() : null,
      symbolUniverseType: row.symbolUniverseType,
      tradeRationale: row.tradeRationale,
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
    signalId: string | null;
    source: TradeSource;
    note: string | null;
    stopLossPrice: Prisma.Decimal | null;
    takeProfitPrice: Prisma.Decimal | null;
    quantity: Prisma.Decimal;
    fillPrice: Prisma.Decimal;
    fillNotional: Prisma.Decimal;
    cashBalance: Prisma.Decimal;
    existingPosition: PaperPositionState | null;
  }): Promise<PlaceMarketOrderResult> {
    if (params.cashBalance.lessThan(params.fillNotional)) {
      throw new ConflictException(
        'Insufficient cash balance for BUY market order.',
      );
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
      signalId: params.signalId,
      source: params.source,
      note: params.note,
      stopLossPrice: params.stopLossPrice,
      takeProfitPrice: params.takeProfitPrice,
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
      signalId: params.signalId,
      source: params.source,
      note: params.note,
      stopLossPrice: params.stopLossPrice
        ? params.stopLossPrice.toNumber()
        : null,
      takeProfitPrice: params.takeProfitPrice
        ? params.takeProfitPrice.toNumber()
        : null,
    };
  }

  private async executeSell(params: {
    accountId: string;
    ticker: string;
    symbolId: string;
    signalId: string | null;
    source: TradeSource;
    note: string | null;
    stopLossPrice: Prisma.Decimal | null;
    takeProfitPrice: Prisma.Decimal | null;
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
      throw new ConflictException(
        'Short selling is disabled for this paper account.',
      );
    }

    const nextCashBalance = params.cashBalance.add(params.fillNotional);
    const remainingQuantity = params.existingPosition.quantity.sub(
      params.quantity,
    );
    const realizedDelta = params.fillPrice
      .sub(params.existingPosition.averageCost)
      .mul(params.quantity);

    const nextAverageCost = remainingQuantity.equals(0)
      ? new Prisma.Decimal(0)
      : params.existingPosition.averageCost;

    const created = await this.paperTradingRepository.createFilledOrder({
      accountId: params.accountId,
      symbolId: params.symbolId,
      signalId: params.signalId,
      source: params.source,
      note: params.note,
      stopLossPrice: params.stopLossPrice,
      takeProfitPrice: params.takeProfitPrice,
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
      signalId: params.signalId,
      source: params.source,
      note: params.note,
      stopLossPrice: params.stopLossPrice
        ? params.stopLossPrice.toNumber()
        : null,
      takeProfitPrice: params.takeProfitPrice
        ? params.takeProfitPrice.toNumber()
        : null,
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
        signalId: params.order.signalId,
        source: params.order.source,
        note: params.order.note,
        stopLossPrice: params.order.stopLossPrice,
        takeProfitPrice: params.order.takeProfitPrice,
      },
    });
  }
}
