import { Injectable, NotFoundException } from '@nestjs/common';
import { UniverseType } from '@prisma/client';
import { MarketDataRepository } from '../market-data/market-data.repository';
import { DEFAULT_SYNC_SYMBOLS } from '../market-data/market-data.constants';

@Injectable()
export class SymbolsService {
  constructor(private readonly marketDataRepository: MarketDataRepository) {}

  listSymbols() {
    return this.marketDataRepository.listTrackedSymbols();
  }

  async addSymbol(
    ticker: string,
    name?: string,
    universeType: UniverseType = 'ON_DEMAND',
  ) {
    const existing =
      await this.marketDataRepository.getTrackedSymbolByTicker(ticker);
    if (existing) {
      return existing;
    }
    return this.marketDataRepository.createTrackedSymbol(
      ticker,
      name,
      universeType,
    );
  }

  async bootstrapDefaults() {
    await this.marketDataRepository.seedDefaultSymbols(DEFAULT_SYNC_SYMBOLS);
    return this.listSymbols();
  }

  async toggleSymbol(ticker: string) {
    const updated = await this.marketDataRepository.toggleSymbolActive(ticker);
    if (!updated) {
      throw new NotFoundException(`Tracked symbol not found: ${ticker}`);
    }
    return updated;
  }
}
