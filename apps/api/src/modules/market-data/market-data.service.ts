import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UniverseType } from '@prisma/client';
import { AlpacaClient } from './alpaca.client';
import { utcCalendarDateFromIso, utcHourStartFromIso } from './bar-date.util';
import {
  DEFAULT_SYNC_BAR_LIMIT,
  DEFAULT_SYNC_SYMBOLS,
} from './market-data.constants';
import {
  H1_INCREMENTAL_OVERLAP_MS,
  H1_MAX_BARS_PER_SYMBOL,
  H1_MAX_QUERY_LIMIT,
  H1_STALE_AFTER_MS,
  HourlySyncPolicy,
  hourlyLookbackDaysForPolicy,
  utcCutoffDaysAgo,
} from './market-data-hourly.constants';
import { MarketDataRepository } from './market-data.repository';
import { FormattedBar, FormattedQuote } from './dto/market-data-response.dto';
import { formatTradingViewSymbol } from './tradingview-symbol.util';

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
    const effectiveLimit = limit < 1 ? 30 : limit;
    const rows = await this.marketDataRepository.findStoredDailyBarsByTicker(
      normalized,
      effectiveLimit,
    );
    return rows
      .slice()
      .reverse()
      .map((row) => ({
        symbol: row.symbol,
        open: row.open.toNumber(),
        high: row.high.toNumber(),
        low: row.low.toNumber(),
        close: row.close.toNumber(),
        volume: row.volume.toNumber(),
        timestamp: row.date.toISOString(),
      }));
  }

  normalizeTicker(symbol: string): string {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('Symbol is required.');
    }
    return normalized;
  }

  async resolveTradingViewChartSymbol(symbol: string): Promise<{
    ticker: string;
    exchange: string;
    tradingViewSymbol: string;
  }> {
    const ticker = this.normalizeTicker(symbol);
    const asset = await this.alpacaClient.getAsset(ticker);
    if (!asset) {
      throw new NotFoundException(`Unknown symbol: ${ticker}`);
    }

    return {
      ticker,
      exchange: asset.exchange.toUpperCase(),
      tradingViewSymbol: formatTradingViewSymbol(asset.exchange, ticker),
    };
  }

  /**
   * Fetch daily bars from Alpaca, ensure Symbol exists, upsert DailyPrice rows.
   */
  async syncDailyBars(
    symbol: string,
    limit = DEFAULT_SYNC_BAR_LIMIT,
  ): Promise<number> {
    const runId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAtMs = Date.now();
    const ticker = this.normalizeTicker(symbol);
    const effectiveLimit =
      limit === undefined || limit < 1 ? DEFAULT_SYNC_BAR_LIMIT : limit;

    this.logger.log(
      JSON.stringify({
        event: 'sync_daily_bars_started',
        runId,
        symbol: ticker,
        limit: effectiveLimit,
      }),
    );

    try {
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
        JSON.stringify({
          event: 'sync_daily_bars_completed',
          runId,
          symbol: ticker,
          barsFetched: bars.length,
          rowsUpserted: rows.length,
          durationMs: Date.now() - startedAtMs,
        }),
      );

      return rows.length;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'sync_daily_bars_failed',
          runId,
          symbol: ticker,
          limit: effectiveLimit,
          durationMs: Date.now() - startedAtMs,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        }),
      );
      throw error;
    }
  }

  async syncDefaultSymbols(): Promise<{
    message: string;
    symbolsProcessed: number;
    rowsUpserted: number;
  }> {
    const runId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAtMs = Date.now();

    this.logger.log(
      JSON.stringify({
        event: 'sync_default_symbols_started',
        runId,
        defaultSymbols: DEFAULT_SYNC_SYMBOLS,
      }),
    );

    await this.marketDataRepository.seedDefaultSymbols(DEFAULT_SYNC_SYMBOLS);
    const activeSymbols = await this.marketDataRepository.findActiveSymbols();

    let rowsUpserted = 0;
    try {
      for (const symbol of activeSymbols) {
        const barsUpserted = await this.syncDailyBars(
          symbol.ticker,
          DEFAULT_SYNC_BAR_LIMIT,
        );
        rowsUpserted += barsUpserted;
      }

      this.logger.log(
        JSON.stringify({
          event: 'sync_default_symbols_completed',
          runId,
          symbolsProcessed: activeSymbols.length,
          rowsUpserted,
          durationMs: Date.now() - startedAtMs,
        }),
      );
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'sync_default_symbols_failed',
          runId,
          symbolsProcessed: activeSymbols.length,
          rowsUpsertedBeforeFailure: rowsUpserted,
          durationMs: Date.now() - startedAtMs,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        }),
      );
      throw error;
    }

    return {
      message: 'Sync complete',
      symbolsProcessed: activeSymbols.length,
      rowsUpserted,
    };
  }

  async getHourlyBars(symbol: string, limit = 120): Promise<FormattedBar[]> {
    const normalized = this.normalizeTicker(symbol);
    const effectiveLimit =
      limit < 1 ? 120 : Math.min(limit, H1_MAX_QUERY_LIMIT);
    const rows = await this.marketDataRepository.findHourlyBarsByTicker(
      normalized,
      effectiveLimit,
    );
    return rows
      .slice()
      .reverse()
      .map((row) => ({
        symbol: row.symbol,
        open: row.open.toNumber(),
        high: row.high.toNumber(),
        low: row.low.toNumber(),
        close: row.close.toNumber(),
        volume: row.volume.toNumber(),
        timestamp: row.timestamp.toISOString(),
      }));
  }

  resolveHourlyPolicy(universeType: UniverseType): HourlySyncPolicy {
    return universeType === 'CORE' ? 'CORE' : 'ON_DEMAND';
  }

  async syncHourlyBarsForSymbol(symbol: string): Promise<number> {
    const ticker = this.normalizeTicker(symbol);
    const tracked = await this.marketDataRepository.findSymbolByTicker(ticker);
    const policy = tracked
      ? this.resolveHourlyPolicy(tracked.universeType)
      : 'ON_DEMAND';
    return this.syncHourlyBars(ticker, policy);
  }

  async ensureHourlyBarsForSymbols(symbols: string[]): Promise<void> {
    const unique = [
      ...new Set(
        symbols
          .map((symbol) => this.normalizeTicker(symbol))
          .filter((symbol) => symbol.length > 0),
      ),
    ];

    for (const symbol of unique) {
      try {
        await this.ensureHourlyBars(symbol);
      } catch (error) {
        this.logger.warn(
          `Skipped hourly ensure for ${symbol}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async ensureHourlyBars(symbol: string): Promise<void> {
    const ticker = this.normalizeTicker(symbol);
    const tracked = await this.marketDataRepository.findSymbolByTicker(ticker);
    if (!tracked) {
      throw new NotFoundException(`Symbol ${ticker} is not tracked.`);
    }

    const latest = await this.marketDataRepository.latestHourlyTimestamp(
      tracked.id,
    );
    const isStale =
      latest === null ||
      Date.now() - latest.getTime() > H1_STALE_AFTER_MS;

    if (!isStale) {
      return;
    }

    const policy = this.resolveHourlyPolicy(tracked.universeType);
    await this.syncHourlyBars(ticker, policy);
  }

  /**
   * Fetch bounded H1 bars from Alpaca, upsert Candle rows, prune outside lookback.
   */
  async syncHourlyBars(
    symbol: string,
    policy: HourlySyncPolicy,
  ): Promise<number> {
    const runId = `sync-h1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAtMs = Date.now();
    const ticker = this.normalizeTicker(symbol);
    const lookbackDays = hourlyLookbackDaysForPolicy(policy);
    const windowCutoff = utcCutoffDaysAgo(lookbackDays);
    const end = new Date();

    this.logger.log(
      JSON.stringify({
        event: 'sync_hourly_bars_started',
        runId,
        symbol: ticker,
        policy,
        lookbackDays,
      }),
    );

    try {
      const { id: symbolId } =
        await this.marketDataRepository.findOrCreateSymbolByTicker(ticker);

      const latestStored =
        await this.marketDataRepository.latestHourlyTimestamp(symbolId);

      let start = windowCutoff;
      if (latestStored !== null) {
        const overlapStart = new Date(
          latestStored.getTime() - H1_INCREMENTAL_OVERLAP_MS,
        );
        start = overlapStart > windowCutoff ? overlapStart : windowCutoff;
      }

      const bars = await this.alpacaClient.getHourlyBars(
        ticker,
        start,
        end,
        H1_MAX_BARS_PER_SYMBOL,
      );

      const rows = bars.map((bar) => ({
        timestamp: utcHourStartFromIso(bar.timestamp),
        open: new Prisma.Decimal(bar.open),
        high: new Prisma.Decimal(bar.high),
        low: new Prisma.Decimal(bar.low),
        close: new Prisma.Decimal(bar.close),
        volume: new Prisma.Decimal(bar.volume),
      }));

      await this.marketDataRepository.upsertHourlyBars(symbolId, rows);
      await this.marketDataRepository.pruneHourlyBars(symbolId, windowCutoff);
      await this.marketDataRepository.trimHourlyBarsToMax(
        symbolId,
        H1_MAX_BARS_PER_SYMBOL,
      );

      this.logger.log(
        JSON.stringify({
          event: 'sync_hourly_bars_completed',
          runId,
          symbol: ticker,
          policy,
          barsFetched: bars.length,
          rowsUpserted: rows.length,
          durationMs: Date.now() - startedAtMs,
        }),
      );

      return rows.length;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'sync_hourly_bars_failed',
          runId,
          symbol: ticker,
          policy,
          lookbackDays,
          durationMs: Date.now() - startedAtMs,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        }),
      );
      throw error;
    }
  }

  async syncCoreHourlySymbols(): Promise<{
    message: string;
    symbolsProcessed: number;
    rowsUpserted: number;
  }> {
    const runId = `batch-h1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAtMs = Date.now();

    this.logger.log(
      JSON.stringify({
        event: 'sync_core_hourly_started',
        runId,
      }),
    );

    const coreSymbols = await this.marketDataRepository.findCoreSymbols();
    let rowsUpserted = 0;

    try {
      for (const symbol of coreSymbols) {
        const count = await this.syncHourlyBars(symbol.ticker, 'CORE');
        rowsUpserted += count;
      }

      this.logger.log(
        JSON.stringify({
          event: 'sync_core_hourly_completed',
          runId,
          symbolsProcessed: coreSymbols.length,
          rowsUpserted,
          durationMs: Date.now() - startedAtMs,
        }),
      );
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'sync_core_hourly_failed',
          runId,
          symbolsProcessed: coreSymbols.length,
          rowsUpsertedBeforeFailure: rowsUpserted,
          durationMs: Date.now() - startedAtMs,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        }),
      );
      throw error;
    }

    return {
      message: 'Hourly sync complete',
      symbolsProcessed: coreSymbols.length,
      rowsUpserted,
    };
  }
}
