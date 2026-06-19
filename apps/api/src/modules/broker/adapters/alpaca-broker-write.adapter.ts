import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type {
  BrokerMarketOrderRequest,
  BrokerOrderSubmission,
  BrokerWritePort,
} from '../ports/broker-write.port';

type AlpacaOrderResponse = {
  id?: string;
  status?: string;
  filled_qty?: string;
  filled_avg_price?: string | null;
};

function parseOptionalAlpacaNumber(
  value: string | null | undefined,
  field: string,
): number | null {
  if (value === undefined || value === null || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadGatewayException(`Alpaca response has invalid ${field}.`);
  }
  return parsed;
}

function mapAlpacaOrderResponse(
  payload: AlpacaOrderResponse,
): BrokerOrderSubmission {
  const brokerOrderId = payload.id?.trim();
  if (!brokerOrderId) {
    throw new BadGatewayException('Alpaca order response missing id.');
  }

  const status = payload.status?.trim() || 'unknown';
  const filledQty = parseOptionalAlpacaNumber(payload.filled_qty, 'filled_qty');
  const filledAvgPrice = parseOptionalAlpacaNumber(
    payload.filled_avg_price,
    'filled_avg_price',
  );

  return {
    brokerOrderId,
    status,
    filledQty: filledQty ?? 0,
    filledAvgPrice,
  };
}

@Injectable()
export class AlpacaBrokerWriteAdapter implements BrokerWritePort {
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

  async submitMarketOrder(
    request: BrokerMarketOrderRequest,
  ): Promise<BrokerOrderSubmission> {
    const symbol = request.symbol.trim().toUpperCase();
    if (!symbol) {
      throw new BadGatewayException('Alpaca order symbol is required.');
    }
    if (!Number.isFinite(request.qty) || request.qty <= 0) {
      throw new BadGatewayException('Alpaca order qty must be a positive number.');
    }

    const url = `${this.tradingBaseUrl}/v2/orders`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        symbol,
        qty: String(request.qty),
        side: request.side,
        type: 'market',
        time_in_force: 'day',
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new BadGatewayException(
        `Alpaca submit order failed (${response.status}): ${details}`,
      );
    }

    const payload = (await response.json()) as AlpacaOrderResponse;
    return mapAlpacaOrderResponse(payload);
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    const normalizedId = brokerOrderId.trim();
    if (!normalizedId) {
      throw new BadGatewayException('Alpaca broker order id is required.');
    }

    const url = `${this.tradingBaseUrl}/v2/orders/${encodeURIComponent(normalizedId)}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new BadGatewayException(
        `Alpaca cancel order failed (${response.status}): ${details}`,
      );
    }
  }
}

export {
  mapAlpacaOrderResponse,
  parseOptionalAlpacaNumber,
};
