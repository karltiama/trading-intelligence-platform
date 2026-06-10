import {
  resolvePartialCloseQuantity,
  resolvePositionExitTrigger,
} from './position-exit.util';

describe('resolvePositionExitTrigger', () => {
  it('returns STOP_LOSS when price is at or below stop', () => {
    expect(
      resolvePositionExitTrigger({
        currentPrice: 94,
        stopLossPrice: 95,
        takeProfitPrice: 110,
      }),
    ).toBe('STOP_LOSS');
  });

  it('returns TAKE_PROFIT when price is at or above target', () => {
    expect(
      resolvePositionExitTrigger({
        currentPrice: 112,
        stopLossPrice: 95,
        takeProfitPrice: 110,
      }),
    ).toBe('TAKE_PROFIT');
  });

  it('returns null when price is between stop and target', () => {
    expect(
      resolvePositionExitTrigger({
        currentPrice: 100,
        stopLossPrice: 95,
        takeProfitPrice: 110,
      }),
    ).toBeNull();
  });

  it('prioritizes stop loss when both levels would trigger', () => {
    expect(
      resolvePositionExitTrigger({
        currentPrice: 90,
        stopLossPrice: 95,
        takeProfitPrice: 80,
      }),
    ).toBe('STOP_LOSS');
  });
});

describe('resolvePartialCloseQuantity', () => {
  it('returns full quantity for a single-share position', () => {
    expect(resolvePartialCloseQuantity(1, 0.5)).toBe(1);
  });

  it('returns half rounded down with a minimum of one share', () => {
    expect(resolvePartialCloseQuantity(3, 0.5)).toBe(1);
    expect(resolvePartialCloseQuantity(4, 0.5)).toBe(2);
  });
});
