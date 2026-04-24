import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import type { BarsQueryDto } from './dto/bars-query.dto';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

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
