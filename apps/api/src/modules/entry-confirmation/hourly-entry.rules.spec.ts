import {
  evaluateHourlyEntryConfirmation,
  hasSufficientH1History,
  h1RelativeVolumePasses,
  lastClosesAboveSma,
  latestCloseAboveEntryPrice,
  lowsAreNonDecreasing,
  type CompletedH1Candle,
} from './hourly-entry.rules';

function buildCandles(
  count: number,
  factory: (index: number) => Omit<CompletedH1Candle, never>,
): CompletedH1Candle[] {
  return Array.from({ length: count }, (_, index) => factory(index));
}

function risingClosesCandles(count: number): CompletedH1Candle[] {
  return buildCandles(count, (index) => ({
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: 1_000_000,
  }));
}

describe('hourly-entry.rules', () => {
  describe('hasSufficientH1History', () => {
    it('requires at least 25 bars by default threshold', () => {
      expect(hasSufficientH1History(risingClosesCandles(24), 25)).toBe(false);
      expect(hasSufficientH1History(risingClosesCandles(25), 25)).toBe(true);
    });
  });

  describe('lastClosesAboveSma', () => {
    it('passes when last 5 closes are above SMA20', () => {
      const closes = [
        ...Array.from({ length: 20 }, () => 100),
        101,
        102,
        103,
        104,
        105,
      ];
      expect(lastClosesAboveSma(closes, 20, 5)).toBe(true);
    });

    it('fails when a recent close is at or below SMA20', () => {
      const closes = [
        ...Array.from({ length: 20 }, () => 100),
        99,
        102,
        103,
        104,
        105,
      ];
      expect(lastClosesAboveSma(closes, 20, 5)).toBe(false);
    });
  });

  describe('latestCloseAboveEntryPrice', () => {
    it('passes when latest close exceeds entry price', () => {
      expect(latestCloseAboveEntryPrice([100, 101, 102], 101.5)).toBe(true);
    });

    it('fails when entry price is null', () => {
      expect(latestCloseAboveEntryPrice([102], null)).toBe(false);
    });

    it('fails when latest close equals entry price', () => {
      expect(latestCloseAboveEntryPrice([100, 101], 101)).toBe(false);
    });
  });

  describe('lowsAreNonDecreasing', () => {
    it('passes when last 5 lows are flat or rising', () => {
      expect(lowsAreNonDecreasing([98, 99, 100, 100, 101], 5)).toBe(true);
    });

    it('fails when a recent low is lower than the prior low', () => {
      expect(lowsAreNonDecreasing([100, 99, 98, 97, 96], 5)).toBe(false);
    });
  });

  describe('h1RelativeVolumePasses', () => {
    it('passes when latest volume exceeds baseline average', () => {
      const volumes = [
        ...Array.from({ length: 20 }, () => 1_000_000),
        1_500_000,
      ];
      expect(h1RelativeVolumePasses(volumes, 20, 1.0)).toBe(true);
    });

    it('fails when latest volume is below minimum ratio', () => {
      const volumes = [
        ...Array.from({ length: 20 }, () => 1_000_000),
        500_000,
      ];
      expect(h1RelativeVolumePasses(volumes, 20, 1.0)).toBe(false);
    });
  });

  describe('evaluateHourlyEntryConfirmation', () => {
    it('fails closed when history is insufficient', () => {
      const result = evaluateHourlyEntryConfirmation({
        candles: risingClosesCandles(10),
        entryPrice: 100,
      });

      expect(result.passed).toBe(false);
      expect(result.checks.hasSufficientHistory).toBe(false);
      expect(result.reasons.some((r) => r.includes('Insufficient H1'))).toBe(
        true,
      );
    });

    it('passes when all required checks succeed', () => {
      const result = evaluateHourlyEntryConfirmation({
        candles: risingClosesCandles(25),
        entryPrice: 110,
      });

      expect(result.passed).toBe(true);
      expect(result.checks).toEqual({
        hasSufficientHistory: true,
        closesAboveSma20: true,
        aboveEntryPrice: true,
        structureNotMakingLowerLows: true,
      });
      expect(result.reasons).toContain('H1 entry confirmation passed.');
    });

    it('fails when structure makes lower lows', () => {
      const candles = risingClosesCandles(25);
      candles[24] = {
        ...candles[24],
        low: candles[23].low - 2,
      };

      const result = evaluateHourlyEntryConfirmation({
        candles,
        entryPrice: 110,
      });

      expect(result.passed).toBe(false);
      expect(result.checks.structureNotMakingLowerLows).toBe(false);
    });

    it('fails when latest close is not above entry price', () => {
      const result = evaluateHourlyEntryConfirmation({
        candles: risingClosesCandles(25),
        entryPrice: 200,
      });

      expect(result.passed).toBe(false);
      expect(result.checks.aboveEntryPrice).toBe(false);
      expect(result.reasons.some((r) => r.includes('entry price'))).toBe(true);
    });

    it('omits relativeVolumePass when requireRelativeVolume is false', () => {
      const result = evaluateHourlyEntryConfirmation({
        candles: risingClosesCandles(25),
        entryPrice: 110,
      });

      expect(result.checks.relativeVolumePass).toBeUndefined();
    });

    it('evaluates relative volume when requireRelativeVolume is true', () => {
      const candles = risingClosesCandles(25);
      candles[24] = { ...candles[24], volume: 100_000 };

      const result = evaluateHourlyEntryConfirmation({
        candles,
        entryPrice: 110,
        config: { requireRelativeVolume: true },
      });

      expect(result.checks.relativeVolumePass).toBe(false);
      expect(result.passed).toBe(false);
    });

    it('passes relative volume check when volume is elevated', () => {
      const candles = risingClosesCandles(25);
      candles[24] = { ...candles[24], volume: 2_000_000 };

      const result = evaluateHourlyEntryConfirmation({
        candles,
        entryPrice: 110,
        config: { requireRelativeVolume: true },
      });

      expect(result.checks.relativeVolumePass).toBe(true);
      expect(result.passed).toBe(true);
    });
  });
});
