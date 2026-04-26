export type TrendPullbackInput = {
  closes: number[];
  volumes: number[];
  latestHigh: number;
  latestLow: number;
};

export type TrendPullbackScore = {
  isValid: boolean;
  confidence: number;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
  reason: string;
  reasons: string[];
  timeHorizon: '3-10 trading days';
};

export function calculateSma(values: number[], period: number): number | null {
  if (period < 1 || values.length < period) {
    return null;
  }
  const window = values.slice(values.length - period);
  const sum = window.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

export function calculateRsi(closes: number[], period: number): number | null {
  if (period < 1 || closes.length < period + 1) {
    return null;
  }

  const slice = closes.slice(closes.length - (period + 1));
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < slice.length; i += 1) {
    const diff = slice[i] - slice[i - 1];
    if (diff > 0) {
      gains += diff;
    } else if (diff < 0) {
      losses += Math.abs(diff);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateRelativeVolume(
  volumes: number[],
  period: number,
): number | null {
  if (period < 1 || volumes.length < period + 1) {
    return null;
  }

  const latestVolume = volumes[volumes.length - 1];
  const baselineSlice = volumes.slice(volumes.length - (period + 1), volumes.length - 1);
  const baseline = baselineSlice.reduce((acc, value) => acc + value, 0) / period;

  if (baseline <= 0) {
    return null;
  }
  return latestVolume / baseline;
}

export function scoreTrendPullback(input: TrendPullbackInput): TrendPullbackScore {
  const { closes, volumes, latestHigh, latestLow } = input;
  const reasons: string[] = [];
  let confidence = 0;

  if (closes.length < 200 || volumes.length < 30) {
    return {
      isValid: false,
      confidence: 0,
      entryPrice: null,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      reason: 'Insufficient historical data for trend pullback scan.',
      reasons: ['Need at least 200 closes and 30 volumes.'],
      timeHorizon: '3-10 trading days',
    };
  }

  const latestClose = closes[closes.length - 1];
  const sma20 = calculateSma(closes, 20);
  const sma50 = calculateSma(closes, 50);
  const sma200 = calculateSma(closes, 200);
  const rsi14 = calculateRsi(closes, 14);
  const relativeVolume = calculateRelativeVolume(volumes, 20);

  if (
    sma20 === null ||
    sma50 === null ||
    sma200 === null ||
    rsi14 === null ||
    relativeVolume === null
  ) {
    return {
      isValid: false,
      confidence: 0,
      entryPrice: null,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      reason: 'Could not compute indicators for trend pullback scan.',
      reasons: ['Missing indicator values after validation.'],
      timeHorizon: '3-10 trading days',
    };
  }

  const uptrend = latestClose > sma50 && latestClose > sma200;
  if (uptrend) {
    confidence += 30;
    reasons.push('Close is above SMA 50 and SMA 200 (uptrend intact).');
  }

  const distanceToSma20 = Math.abs(latestClose - sma20) / sma20;
  const nearSma20 = distanceToSma20 <= 0.02;
  if (nearSma20) {
    confidence += 25;
    reasons.push('Close is near SMA 20 (pullback zone).');
  }

  const rsiReset = rsi14 >= 40 && rsi14 <= 60;
  if (rsiReset) {
    confidence += 20;
    reasons.push('RSI(14) is between 40 and 60 (healthy reset).');
  }

  const volumeHealthy = relativeVolume >= 0.7;
  if (volumeHealthy) {
    confidence += 15;
    reasons.push('Relative volume is healthy (not extremely weak).');
  }

  const entryPrice = latestClose;
  const stopLoss = Math.min(latestLow, sma20 * 0.99);
  const risk = entryPrice - stopLoss;
  const targetPrice = entryPrice + risk * 2;
  const riskReward = risk > 0 ? (targetPrice - entryPrice) / risk : null;
  const acceptableRiskReward = riskReward !== null && riskReward >= 1.5;
  if (acceptableRiskReward) {
    confidence += 10;
    reasons.push('Risk/reward is acceptable for a pullback continuation setup.');
  }

  confidence = Math.min(100, confidence);

  const isValid =
    uptrend && nearSma20 && rsiReset && volumeHealthy && acceptableRiskReward;

  if (!isValid && reasons.length === 0) {
    reasons.push('Core setup rules not satisfied.');
  }

  const lastReason = isValid
    ? 'Trend pullback setup qualifies.'
    : 'Trend pullback setup does not qualify.';

  return {
    isValid,
    confidence,
    entryPrice,
    stopLoss,
    targetPrice,
    riskReward,
    reason: `${lastReason} ${reasons.join(' ')}`.trim(),
    reasons,
    timeHorizon: '3-10 trading days',
  };
}
