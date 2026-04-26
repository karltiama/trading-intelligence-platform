import {
  calculateRelativeVolume,
  calculateRsi,
  calculateSma,
  scoreTrendPullback,
} from './signal-scoring';

describe('signal-scoring', () => {
  it('calculates SMA for trailing window', () => {
    expect(calculateSma([1, 2, 3, 4, 5], 3)).toBeCloseTo(4);
  });

  it('calculates RSI in bounded range', () => {
    const closes = [
      100, 101, 102, 101, 103, 104, 103, 105, 106, 105, 107, 108, 107, 109, 110,
    ];
    const rsi = calculateRsi(closes, 14);
    expect(rsi).not.toBeNull();
    expect(rsi as number).toBeGreaterThanOrEqual(0);
    expect(rsi as number).toBeLessThanOrEqual(100);
  });

  it('returns null for insufficient SMA data', () => {
    expect(calculateSma([1, 2], 3)).toBeNull();
  });

  it('calculates relative volume versus baseline', () => {
    const volumes = [100, 100, 100, 100, 100, 150];
    expect(calculateRelativeVolume(volumes, 5)).toBeCloseTo(1.5);
  });

  it('returns invalid score for insufficient trend data', () => {
    const score = scoreTrendPullback({
      closes: Array.from({ length: 50 }, (_, i) => 100 + i * 0.2),
      volumes: Array.from({ length: 50 }, () => 1_000_000),
      latestHigh: 120,
      latestLow: 118,
    });
    expect(score.isValid).toBe(false);
    expect(score.confidence).toBe(0);
  });

  it('scores valid trend pullback setup with high confidence', () => {
    const closes = Array.from({ length: 230 }, (_, i) => 100 + i * 0.2);
    const base = closes[209];
    for (let i = 210; i < 230; i += 1) {
      closes[i] = base * (1 + ((i - 210) % 3) * 0.001);
    }
    const volumes = Array.from({ length: 230 }, () => 1_000_000);
    volumes[229] = 950_000;

    const latestClose = closes[closes.length - 1];
    const score = scoreTrendPullback({
      closes,
      volumes,
      latestHigh: latestClose * 1.01,
      latestLow: latestClose * 0.99,
    });

    expect(score.isValid).toBe(true);
    expect(score.confidence).toBeGreaterThanOrEqual(80);
    expect(score.riskReward).not.toBeNull();
    expect(score.timeHorizon).toBe('3-10 trading days');
  });
});
