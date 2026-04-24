import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AlpacaClient } from './alpaca.client';
import { FormattedBar, FormattedQuote } from './dto/market-data-response.dto';

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(private readonly alpacaClient: AlpacaClient) {}

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
}
