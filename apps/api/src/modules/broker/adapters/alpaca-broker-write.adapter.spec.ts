import { BadGatewayException } from '@nestjs/common';
import { mapAlpacaOrderResponse } from './alpaca-broker-write.adapter';

describe('mapAlpacaOrderResponse', () => {
  it('maps a filled Alpaca order response', () => {
    expect(
      mapAlpacaOrderResponse({
        id: 'alpaca-order-1',
        status: 'filled',
        filled_qty: '5',
        filled_avg_price: '150.25',
      }),
    ).toEqual({
      brokerOrderId: 'alpaca-order-1',
      status: 'filled',
      filledQty: 5,
      filledAvgPrice: 150.25,
    });
  });

  it('maps pending orders with zero fill qty', () => {
    expect(
      mapAlpacaOrderResponse({
        id: 'alpaca-order-2',
        status: 'new',
        filled_qty: '0',
        filled_avg_price: null,
      }),
    ).toEqual({
      brokerOrderId: 'alpaca-order-2',
      status: 'new',
      filledQty: 0,
      filledAvgPrice: null,
    });
  });

  it('rejects responses without an order id', () => {
    expect(() => mapAlpacaOrderResponse({ status: 'filled' })).toThrow(
      BadGatewayException,
    );
  });
});
