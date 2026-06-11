import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { BrokerAccountSnapshot } from '../dto/broker-snapshot.dto';
import type { BrokerPosition } from '../dto/broker-position.dto';
import type { BrokerReadPort } from '../ports/broker-read.port';

type AlpacaAccountResponse = {
  equity?: string;
  cash?: string;
  buying_power?: string;
  portfolio_value?: string;
  last_equity?: string;
  currency?: string;
};

type AlpacaPositionResponse = {
  symbol?: string;
  qty?: string;
  avg_entry_price?: string;
  market_value?: string;
  unrealized_pl?: string;
  current_price?: string;
};

function parseAlpacaNumber(value: string | undefined, field: string): number {
  if (value === undefined || value.trim() === '') {
    throw new BadGatewayException(`Alpaca response missing ${field}.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadGatewayException(`Alpaca response has invalid ${field}.`);
  }
  return parsed;
}

function buildAccountSnapshot(
  payload: AlpacaAccountResponse,
): BrokerAccountSnapshot {
  const equity = parseAlpacaNumber(payload.equity, 'equity');
  const lastEquity = parseAlpacaNumber(payload.last_equity, 'last_equity');
  const dayChange = equity - lastEquity;
  const dayChangePercent = lastEquity > 0 ? dayChange / lastEquity : 0;

  return {
    equity,
    cash: parseAlpacaNumber(payload.cash, 'cash'),
    buyingPower: parseAlpacaNumber(payload.buying_power, 'buying_power'),
    portfolioValue: parseAlpacaNumber(
      payload.portfolio_value,
      'portfolio_value',
    ),
    lastEquity,
    dayChange,
    dayChangePercent,
    currency: 'USD',
  };
}

function mapPosition(row: AlpacaPositionResponse): BrokerPosition {
  const symbol = row.symbol?.trim().toUpperCase();
  if (!symbol) {
    throw new BadGatewayException('Alpaca position missing symbol.');
  }

  return {
    symbol,
    quantity: parseAlpacaNumber(row.qty, 'qty'),
    averageCost: parseAlpacaNumber(row.avg_entry_price, 'avg_entry_price'),
    marketValue: parseAlpacaNumber(row.market_value, 'market_value'),
    unrealizedPnl: parseAlpacaNumber(row.unrealized_pl, 'unrealized_pl'),
    currentPrice: parseAlpacaNumber(row.current_price, 'current_price'),
  };
}

@Injectable()
export class AlpacaBrokerReadAdapter implements BrokerReadPort {
  private readonly tradingBaseUrl =
    process.env.ALPACA_TRADING_BASE_URL ?? 'https://paper-api.alpaca.markets';

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

  async getAccountSnapshot(): Promise<BrokerAccountSnapshot> {
    const url = `${this.tradingBaseUrl}/v2/account`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new BadGatewayException(
        `Alpaca account request failed (${response.status}): ${details}`,
      );
    }

    const payload = (await response.json()) as AlpacaAccountResponse;
    return buildAccountSnapshot(payload);
  }

  async listOpenPositions(): Promise<BrokerPosition[]> {
    const url = `${this.tradingBaseUrl}/v2/positions`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new BadGatewayException(
        `Alpaca positions request failed (${response.status}): ${details}`,
      );
    }

    const payload = (await response.json()) as AlpacaPositionResponse[];
    if (!Array.isArray(payload)) {
      throw new BadGatewayException('Alpaca positions response was not an array.');
    }

    return payload.map(mapPosition);
  }
}

export { buildAccountSnapshot, mapPosition, parseAlpacaNumber };
