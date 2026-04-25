import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { DEFAULT_SYNC_BAR_LIMIT } from './market-data.constants';
import type { BarsQueryDto } from './dto/bars-query.dto';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Post('sync')
  syncDefaultSymbols() {
    return this.marketDataService.syncDefaultSymbols();
  }

  @Post('sync/:symbol')
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
      limit = parsed;
    }

    const barsUpserted = await this.marketDataService.syncDailyBars(
      symbol,
      limit,
    );

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
