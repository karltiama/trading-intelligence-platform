import {
  calculateRelativeVolume,
  calculateSma,
  scoreTrendPullback,
} from './signal-scoring';

describe('signal-scoring', () => {
  it('calculates SMA for trailing window', () => {
    expect(calculateSma([1, 2, 3, 4, 5], 3)).toBeCloseTo(4);
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
      highs: Array.from({ length: 50 }, (_, i) => 101 + i * 0.2),
      lows: Array.from({ length: 50 }, (_, i) => 99 + i * 0.2),
    });
    expect(score.isValid).toBe(false);
    expect(score.confidence).toBe(0);
    expect(score.scannerScore.grade).toBe('IGNORE');
  });

  it('scores valid trend pullback setup with STRONG grade', () => {
    const closes = Array.from({ length: 230 }, (_, i) => 100 + i * 0.2);
    const base = closes[209];
    for (let i = 210; i < 230; i += 1) {
      closes[i] = base * (1 + ((i - 210) % 3) * 0.001);
    }
    const highs = closes.map((close) => close * 1.01);
    const lows = closes.map((close) => close * 0.99);
    const volumes = Array.from({ length: 230 }, () => 1_000_000);
    volumes[229] = 1_100_000;

    const score = scoreTrendPullback({
      closes,
      volumes,
      highs,
      lows,
    });

    expect(score.isValid).toBe(true);
    expect(score.confidence).toBeGreaterThanOrEqual(80);
    expect(score.scannerScore.grade).toBe('STRONG');
    expect(score.riskReward).not.toBeNull();
    expect(score.timeHorizon).toBe('3-10 trading days');
  });

  it('includes both pass and fail diagnostics for partial setups', () => {
    const closes = Array.from({ length: 230 }, (_, i) => 200 + i * 0.15);
    const highs = closes.map((close) => close * 1.01);
    const lows = closes.map((close) => close * 0.99);
    const volumes = Array.from({ length: 230 }, () => 600_000);
    volumes[229] = 350_000;

    const score = scoreTrendPullback({ closes, volumes, highs, lows });
    const text = score.reasons.join(' ');

    expect(text).toContain('trend intact');
    expect(text).toContain('below confirmation threshold');
    expect(score.scannerScore.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.scannerScore.totalScore).toBeLessThanOrEqual(100);
  });
});
