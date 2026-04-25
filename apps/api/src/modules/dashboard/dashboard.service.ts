import { Injectable } from '@nestjs/common';
import { MarketDataRepository } from '../market-data/market-data.repository';
import type { MarketSummaryRow } from './dashboard.types';
import { mapSymbolLatestBarsToSummary } from './market-summary.mapper';

@Injectable()
export class DashboardService {
  constructor(private readonly marketDataRepository: MarketDataRepository) {}

  async getMarketSummary(): Promise<MarketSummaryRow[]> {
    const rows = await this.marketDataRepository.findLatestBarsPerSymbol();
    return rows.map(mapSymbolLatestBarsToSummary);
  }
}
