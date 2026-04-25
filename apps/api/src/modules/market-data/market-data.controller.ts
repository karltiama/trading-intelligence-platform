import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DEFAULT_SYNC_BAR_LIMIT } from './market-data.constants';
import type { BarsQueryDto } from './dto/bars-query.dto';
import { MarketDataService } from './market-data.service';
import { SyncApiKeyGuard } from './sync-api-key.guard';

const MAX_SYNC_BAR_LIMIT = 500;

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  private toSyncHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const response = error.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : (response as { message?: string | string[] }).message;
      const normalizedMessage = Array.isArray(message)
        ? message.join(', ')
        : message ?? 'Sync request failed.';

      return new HttpException(
        {
          code: 'SYNC_REQUEST_FAILED',
          message: normalizedMessage,
          details:
            typeof response === 'string'
              ? undefined
              : { statusCode: status, ...response },
        },
        status,
      );
    }

    if (error instanceof Error) {
      return new BadGatewayException({
        code: 'SYNC_UPSTREAM_ERROR',
        message: 'Market data sync failed due to upstream provider error.',
        details: { errorName: error.name, errorMessage: error.message },
      });
    }

    return new BadGatewayException({
      code: 'SYNC_UNKNOWN_ERROR',
      message: 'Market data sync failed due to an unknown error.',
      details: { error: String(error) },
    });
  }

  @Post('sync')
  @UseGuards(SyncApiKeyGuard)
  async syncDefaultSymbols() {
    try {
      return await this.marketDataService.syncDefaultSymbols();
    } catch (error) {
      throw this.toSyncHttpException(error);
    }
  }

  @Post('sync/:symbol')
  @UseGuards(SyncApiKeyGuard)
  async syncOneSymbol(
    @Param('symbol') symbol: string,
    @Query('limit') limitRaw?: string,
  ) {
    let limit = DEFAULT_SYNC_BAR_LIMIT;
    if (limitRaw !== undefined && limitRaw !== '') {
      const parsed = Number.parseInt(limitRaw, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        throw new BadRequestException('limit must be a positive integer.');
      }
      if (parsed > MAX_SYNC_BAR_LIMIT) {
        throw new BadRequestException(
          `limit must be less than or equal to ${MAX_SYNC_BAR_LIMIT}.`,
        );
      }
      limit = parsed;
    }

    let barsUpserted: number;
    try {
      barsUpserted = await this.marketDataService.syncDailyBars(symbol, limit);
    } catch (error) {
      throw this.toSyncHttpException(error);
    }

    return {
      symbol: this.marketDataService.normalizeTicker(symbol),
      barsUpserted,
    };
  }

  @Get('test')
  async testConnection() {
    return this.marketDataService.testConnection();
  }

  @Get(':symbol/bars')
  async getBars(@Param('symbol') symbol: string, @Query() query: BarsQueryDto) {
    const limitValue = query.limit;
    const limit =
      typeof limitValue === 'string'
        ? Number.parseInt(limitValue, 10)
        : limitValue;

    if (limit !== undefined && Number.isNaN(limit)) {
      throw new BadRequestException('limit must be a valid number.');
    }

    return this.marketDataService.getBars(symbol, limit ?? 30);
  }
}
