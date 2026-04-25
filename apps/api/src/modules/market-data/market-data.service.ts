import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlpacaClient } from './alpaca.client';
import { utcCalendarDateFromIso } from './bar-date.util';
import {
  DEFAULT_SYNC_BAR_LIMIT,
  DEFAULT_SYNC_SYMBOLS,
} from './market-data.constants';
import { MarketDataRepository } from './market-data.repository';
import { FormattedBar, FormattedQuote } from './dto/market-data-response.dto';

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    private readonly alpacaClient: AlpacaClient,
    private readonly marketDataRepository: MarketDataRepository,
  ) {}

  async testConnection(): Promise<FormattedQuote> {
    const quote = await this.alpacaClient.getLatestQuote('AAPL');
    this.logger.log('Alpaca connection test succeeded for AAPL.');
    return quote;
  }

  async getBars(symbol: string, limit = 30): Promise<FormattedBar[]> {
    const normalized = symbol.trim().toUpperCase();

    if (!normalized) {
      throw new BadRequestException('Symbol is required.');
    }

    return this.alpacaClient.getDailyBars(normalized, limit);
  }

  normalizeTicker(symbol: string): string {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('Symbol is required.');
    }
    return normalized;
  }

  /**
   * Fetch daily bars from Alpaca, ensure Symbol exists, upsert DailyPrice rows.
   */
  async syncDailyBars(
    symbol: string,
    limit = DEFAULT_SYNC_BAR_LIMIT,
  ): Promise<number> {
    const ticker = this.normalizeTicker(symbol);
    const effectiveLimit =
      limit === undefined || limit < 1 ? DEFAULT_SYNC_BAR_LIMIT : limit;

    const bars = await this.alpacaClient.getDailyBars(ticker, effectiveLimit);
    const { id: symbolId } =
      await this.marketDataRepository.findOrCreateSymbolByTicker(ticker);

    const rows = bars.map((bar) => ({
      date: utcCalendarDateFromIso(bar.timestamp),
      open: new Prisma.Decimal(bar.open),
      high: new Prisma.Decimal(bar.high),
      low: new Prisma.Decimal(bar.low),
      close: new Prisma.Decimal(bar.close),
      volume: new Prisma.Decimal(bar.volume),
      source: 'alpaca',
    }));

    await this.marketDataRepository.upsertDailyBars(symbolId, rows);

    this.logger.log(
      `Synced ${rows.length} daily bar(s) for ${ticker} into the database.`,
    );

    return rows.length;
  }

  async syncDefaultSymbols(): Promise<{
    message: string;
    symbolsProcessed: number;
    rowsUpserted: number;
  }> {
    await this.marketDataRepository.seedDefaultSymbols(DEFAULT_SYNC_SYMBOLS);
    const activeSymbols = await this.marketDataRepository.findActiveSymbols();

    let rowsUpserted = 0;
    for (const symbol of activeSymbols) {
      const barsUpserted = await this.syncDailyBars(
        symbol.ticker,
        DEFAULT_SYNC_BAR_LIMIT,
      );
      rowsUpserted += barsUpserted;
    }

    return {
      message: 'Sync complete',
      symbolsProcessed: activeSymbols.length,
      rowsUpserted,
    };
  }
}
