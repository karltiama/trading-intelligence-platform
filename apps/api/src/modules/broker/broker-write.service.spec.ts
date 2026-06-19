import { BadRequestException } from '@nestjs/common';
import { assertBrokerFillPrice } from './broker-write.service';

describe('assertBrokerFillPrice', () => {
  it('returns the filled average price when present', () => {
    expect(
      assertBrokerFillPrice({
        brokerOrderId: 'ord-1',
        status: 'filled',
        filledQty: 1,
        filledAvgPrice: 101.5,
      }),
    ).toBe(101.5);
  });

  it('rejects submissions without a fill price', () => {
    expect(() =>
      assertBrokerFillPrice({
        brokerOrderId: 'ord-1',
        status: 'new',
        filledQty: 0,
        filledAvgPrice: null,
      }),
    ).toThrow(BadRequestException);
  });
});
