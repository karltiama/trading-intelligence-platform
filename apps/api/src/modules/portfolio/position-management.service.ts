import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TradeSource } from '@prisma/client';
import { isUsMarketSessionOpen } from '../../common/market-session.util';
import { MarketDataRepository } from '../market-data/market-data.repository';
import { MarketDataService } from '../market-data/market-data.service';
import { PaperTradingRepository } from '../paper-trading/paper-trading.repository';
import { PaperTradingService } from '../paper-trading/paper-trading.service';
import {
  resolvePartialCloseQuantity,
  resolvePositionExitTrigger,
  type PositionExitTrigger,
} from './position-exit.util';

export type PositionExitResult = {
  accountId: string;
  symbol: string;
  quantity: number;
  reason: PositionExitTrigger;
  orderId: string;
  triggerPrice: number;
  markPrice: number;
};

export type MonitorPositionsResult = {
  evaluated: number;
  exited: PositionExitResult[];
  skipped: { accountId: string; symbol: string; reason: string }[];
};

export type ClosePositionResult = {
  userEmail: string;
  symbol: string;
  quantity: number;
  orderId: string;
  status: string;
  fillPrice: number;
  cashBalance: number;
};

@Injectable()
export class PositionManagementService {
  private readonly logger = new Logger(PositionManagementService.name);

  constructor(
    private readonly paperTradingRepository: PaperTradingRepository,
    private readonly paperTradingService: PaperTradingService,
    private readonly marketDataService: MarketDataService,
    private readonly marketDataRepository: MarketDataRepository,
  ) {}

  async monitorOpenPositions(options?: {
    force?: boolean;
  }): Promise<MonitorPositionsResult> {
    if (!options?.force && !isUsMarketSessionOpen()) {
      return { evaluated: 0, exited: [], skipped: [] };
    }

    const accounts =
      await this.paperTradingRepository.listAccountsWithOpenPositions();
    const result: MonitorPositionsResult = {
      evaluated: 0,
      exited: [],
      skipped: [],
    };

    for (const account of accounts) {
      const accountResult = await this.monitorAccountPositions(
        account.accountId,
        account.userEmail,
      );
      result.evaluated += accountResult.evaluated;
      result.exited.push(...accountResult.exited);
      result.skipped.push(...accountResult.skipped);
    }

    if (result.exited.length > 0) {
      this.logger.log(
        `Position monitor exited ${result.exited.length} position(s).`,
      );
    }

    return result;
  }

  async closePosition(
    userEmail: string,
    symbol: string,
    accountId?: string,
    quantity?: number,
  ): Promise<ClosePositionResult> {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) {
      throw new BadRequestException('symbol is required.');
    }

    const account = await this.paperTradingRepository.resolveAccountForUser({
      userEmail,
      accountId,
    });
    if (!account) {
      throw new NotFoundException('Paper account not found for current user.');
    }

    const quote = await this.paperTradingRepository.findSymbolQuote(ticker);
    if (!quote) {
      throw new NotFoundException(`Tracked symbol not found: ${ticker}`);
    }

    const position = await this.paperTradingRepository.findPosition(
      account.id,
      quote.symbolId,
    );
    const heldQuantity = position?.quantity.toNumber() ?? 0;
    if (heldQuantity <= 0) {
      throw new BadRequestException(`No open position for ${ticker}.`);
    }

    const sellQuantity =
      quantity === undefined
        ? heldQuantity
        : this.toPositiveQuantityAtMost(quantity, heldQuantity);

    const placed = await this.paperTradingService.placeMarketOrder(
      {
        symbol: ticker,
        side: 'SELL',
        quantity: sellQuantity,
        source: TradeSource.MANUAL,
        note:
          sellQuantity === heldQuantity
            ? 'Manual close — full position'
            : `Manual close — partial (${sellQuantity} of ${heldQuantity})`,
      },
      userEmail,
      account.id,
    );

    return {
      userEmail,
      symbol: ticker,
      quantity: sellQuantity,
      orderId: placed.orderId,
      status: placed.status,
      fillPrice: placed.fillPrice,
      cashBalance: placed.cashBalance,
    };
  }

  private async monitorAccountPositions(
    accountId: string,
    userEmail: string,
  ): Promise<MonitorPositionsResult> {
    const positions = await this.paperTradingRepository.listPositions(accountId);
    const openPositions = positions.filter((position) =>
      position.quantity.gt(0),
    );

    if (openPositions.length === 0) {
      return { evaluated: 0, exited: [], skipped: [] };
    }

    await this.marketDataService.ensureHourlyBarsForSymbols(
      openPositions.map((position) => position.symbol),
    );

    const latestPrices =
      await this.marketDataRepository.findLatestMarkPricesForSymbols(
        openPositions.map((position) => position.symbolId),
      );
    const latestOrders =
      await this.paperTradingRepository.findLatestFilledBuyOrdersForSymbols(
        accountId,
        openPositions.map((position) => position.symbolId),
      );

    const result: MonitorPositionsResult = {
      evaluated: openPositions.length,
      exited: [],
      skipped: [],
    };

    for (const position of openPositions) {
      const mark = latestPrices[position.symbolId];
      if (!mark) {
        result.skipped.push({
          accountId,
          symbol: position.symbol,
          reason: 'no_mark_price',
        });
        continue;
      }

      const levels = latestOrders[position.symbolId];
      const stopLossPrice = levels?.stopLossPrice ?? null;
      const takeProfitPrice = levels?.takeProfitPrice ?? null;

      if (stopLossPrice === null && takeProfitPrice === null) {
        result.skipped.push({
          accountId,
          symbol: position.symbol,
          reason: 'no_exit_levels',
        });
        continue;
      }

      const currentPrice = mark.close.toNumber();
      const trigger = resolvePositionExitTrigger({
        currentPrice,
        stopLossPrice,
        takeProfitPrice,
      });
      if (!trigger) {
        continue;
      }

      const sellQuantity = position.quantity.toNumber();
      try {
        const placed = await this.paperTradingService.placeMarketOrder(
          {
            symbol: position.symbol,
            side: 'SELL',
            quantity: sellQuantity,
            source: TradeSource.MANUAL,
            note: this.exitNote(trigger, stopLossPrice, takeProfitPrice),
          },
          userEmail,
          accountId,
        );
        result.exited.push({
          accountId,
          symbol: position.symbol,
          quantity: sellQuantity,
          reason: trigger,
          orderId: placed.orderId,
          triggerPrice:
            trigger === 'STOP_LOSS'
              ? (stopLossPrice as number)
              : (takeProfitPrice as number),
          markPrice: currentPrice,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to auto-exit ${position.symbol} for account ${accountId}: ${message}`,
        );
        result.skipped.push({
          accountId,
          symbol: position.symbol,
          reason: `exit_failed:${message}`,
        });
      }
    }

    return result;
  }

  private exitNote(
    trigger: PositionExitTrigger,
    stopLossPrice: number | null,
    takeProfitPrice: number | null,
  ): string {
    if (trigger === 'STOP_LOSS') {
      return `Auto-exit — stop loss at ${stopLossPrice?.toFixed(2)}`;
    }
    return `Auto-exit — take profit at ${takeProfitPrice?.toFixed(2)}`;
  }

  private toPositiveQuantityAtMost(
    quantity: number,
    maxQuantity: number,
  ): number {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity must be a positive number.');
    }
    if (quantity > maxQuantity) {
      throw new BadRequestException(
        `quantity exceeds held position (${maxQuantity}).`,
      );
    }
    return quantity;
  }
}

export function resolveSellFractionQuantity(
  heldQuantity: number,
  fraction: number,
): number {
  return resolvePartialCloseQuantity(heldQuantity, fraction);
}
