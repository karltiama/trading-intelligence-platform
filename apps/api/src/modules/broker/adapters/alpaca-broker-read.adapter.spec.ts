import { BadGatewayException } from '@nestjs/common';
import {
  buildAccountSnapshot,
  mapPosition,
  parseAlpacaNumber,
} from './alpaca-broker-read.adapter';

describe('parseAlpacaNumber', () => {
  it('converts numeric strings to numbers', () => {
    expect(parseAlpacaNumber('100000.50', 'equity')).toBe(100000.5);
  });

  it('rejects missing values', () => {
    expect(() => parseAlpacaNumber(undefined, 'equity')).toThrow(
      BadGatewayException,
    );
  });

  it('rejects invalid values', () => {
    expect(() => parseAlpacaNumber('not-a-number', 'equity')).toThrow(
      BadGatewayException,
    );
  });
});

describe('buildAccountSnapshot', () => {
  it('maps Alpaca account JSON and computes day change', () => {
    const snapshot = buildAccountSnapshot({
      equity: '101000',
      cash: '50000',
      buying_power: '200000',
      portfolio_value: '51000',
      last_equity: '100000',
    });

    expect(snapshot).toEqual({
      equity: 101000,
      cash: 50000,
      buyingPower: 200000,
      portfolioValue: 51000,
      lastEquity: 100000,
      dayChange: 1000,
      dayChangePercent: 0.01,
      currency: 'USD',
    });
  });

  it('uses zero day change percent when last equity is zero', () => {
    const snapshot = buildAccountSnapshot({
      equity: '1000',
      cash: '1000',
      buying_power: '1000',
      portfolio_value: '0',
      last_equity: '0',
    });

    expect(snapshot.dayChangePercent).toBe(0);
  });
});

describe('mapPosition', () => {
  it('maps Alpaca position JSON', () => {
    expect(
      mapPosition({
        symbol: 'aapl',
        qty: '10',
        avg_entry_price: '150.25',
        market_value: '1600',
        unrealized_pl: '97.5',
        current_price: '160',
      }),
    ).toEqual({
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150.25,
      marketValue: 1600,
      unrealizedPnl: 97.5,
      currentPrice: 160,
    });
  });
});
