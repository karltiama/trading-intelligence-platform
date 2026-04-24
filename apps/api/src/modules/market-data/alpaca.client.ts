import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FormattedBar, FormattedQuote } from './dto/market-data-response.dto';

type AlpacaBarsResponse = {
  bars?: Array<{
    t: string;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }>;
};

type AlpacaLatestQuoteResponse = {
  quote?: {
    bp?: number;
    ap?: number;
    t?: string;
  };
};

@Injectable()
export class AlpacaClient {
  private readonly logger = new Logger(AlpacaClient.name);
  private readonly baseUrl =
    process.env.ALPACA_BASE_URL ?? 'https://data.alpaca.markets';

  private getHeaders(): Record<string, string> {
    const apiKey = process.env.ALPACA_API_KEY;
    const secretKey = process.env.ALPACA_SECRET_KEY;

    if (!apiKey || !secretKey) {
      throw new InternalServerErrorException(
        'Alpaca credentials are missing in environment variables.',
      );
    }

    return {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secretKey,
      'Content-Type': 'application/json',
    };
  }

  async getDailyBars(symbol: string, limit = 30): Promise<FormattedBar[]> {
    const encodedSymbol = encodeURIComponent(symbol);
    const url = `${this.baseUrl}/v2/stocks/${encodedSymbol}/bars?timeframe=1Day&limit=${limit}&adjustment=raw&feed=iex`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new BadGatewayException(
        `Alpaca bars request failed (${response.status}): ${details}`,
      );
    }

    const payload = (await response.json()) as AlpacaBarsResponse;
    const bars = payload.bars ?? [];

    this.logger.log(
      `Fetched ${bars.length} daily bars for ${symbol.toUpperCase()}.`,
    );

    return bars.map((bar) => ({
      symbol: symbol.toUpperCase(),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      timestamp: bar.t,
    }));
  }

  async getLatestQuote(symbol: string): Promise<FormattedQuote> {
    const encodedSymbol = encodeURIComponent(symbol);
    const url = `${this.baseUrl}/v2/stocks/${encodedSymbol}/quotes/latest?feed=iex`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new BadGatewayException(
        `Alpaca quote request failed (${response.status}): ${details}`,
      );
    }

    const payload = (await response.json()) as AlpacaLatestQuoteResponse;
    const quote = payload.quote;

    this.logger.log(`Fetched latest quote for ${symbol.toUpperCase()}.`);

    return {
      symbol: symbol.toUpperCase(),
      bid: quote?.bp ?? null,
      ask: quote?.ap ?? null,
      timestamp: quote?.t ?? null,
    };
  }
}
