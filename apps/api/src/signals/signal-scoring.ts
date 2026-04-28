export type TrendPullbackInput = {
  closes: number[];
  volumes: number[];
  highs: number[];
  lows: number[];
};

export type ScannerGrade = 'STRONG' | 'WATCHLIST' | 'WEAK' | 'IGNORE';

export type ScannerScore = {
  totalScore: number;
  grade: ScannerGrade;
  components: {
    trend: number;
    pullback: number;
    stochastic: number;
    volume: number;
    riskReward: number;
  };
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
  scannerScore: ScannerScore;
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

function calculateStochasticK(
  closes: number[],
  highs: number[],
  lows: number[],
  period: number,
): number | null {
  if (
    period < 1 ||
    closes.length < period ||
    highs.length < period ||
    lows.length < period
  ) {
    return null;
  }
  const recentHighs = highs.slice(highs.length - period);
  const recentLows = lows.slice(lows.length - period);
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  if (highestHigh <= lowestLow) {
    return null;
  }
  const latestClose = closes[closes.length - 1];
  return ((latestClose - lowestLow) / (highestHigh - lowestLow)) * 100;
}

function gradeFromScore(totalScore: number): ScannerGrade {
  if (totalScore >= 80) return 'STRONG';
  if (totalScore >= 60) return 'WATCHLIST';
  if (totalScore >= 40) return 'WEAK';
  return 'IGNORE';
}

function emptyScannerScore(): ScannerScore {
  return {
    totalScore: 0,
    grade: 'IGNORE',
    components: {
      trend: 0,
      pullback: 0,
      stochastic: 0,
      volume: 0,
      riskReward: 0,
    },
  };
}

export function scoreTrendPullback(input: TrendPullbackInput): TrendPullbackScore {
  const { closes, volumes, highs, lows } = input;
  const reasons: string[] = [];
  if (
    closes.length < 200 ||
    volumes.length < 30 ||
    highs.length < 30 ||
    lows.length < 30
  ) {
    return {
      isValid: false,
      confidence: 0,
      entryPrice: null,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      reason: 'Insufficient historical data for trend pullback scan.',
      reasons: ['Need at least 200 closes and 30 volumes.'],
      scannerScore: emptyScannerScore(),
      timeHorizon: '3-10 trading days',
    };
  }

  const latestClose = closes[closes.length - 1];
  const latestLow = lows[lows.length - 1];
  const sma20 = calculateSma(closes, 20);
  const sma50 = calculateSma(closes, 50);
  const sma200 = calculateSma(closes, 200);
  const stochasticK = calculateStochasticK(closes, highs, lows, 14);
  const relativeVolume = calculateRelativeVolume(volumes, 20);
  if (
    sma20 === null ||
    sma50 === null ||
    sma200 === null ||
    stochasticK === null ||
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
      scannerScore: emptyScannerScore(),
      timeHorizon: '3-10 trading days',
    };
  }

  let trendScore = 0;
  let pullbackScore = 0;
  let stochasticScore = 0;
  let volumeScore = 0;
  let riskRewardScore = 0;

  const uptrend = latestClose > sma50 && latestClose > sma200;
  if (uptrend) {
    trendScore = 25;
    reasons.push('Price is above 50/200 SMA: trend intact.');
  } else {
    reasons.push('Trend is weak: close is not above both 50/200 SMA.');
  }

  const distanceToSma20 = Math.abs(latestClose - sma20) / sma20;
  if (distanceToSma20 <= 0.02) {
    pullbackScore = 20;
    reasons.push('Pullback depth is ideal near 20 SMA.');
  } else if (distanceToSma20 <= 0.04) {
    pullbackScore = 10;
    reasons.push('Pullback depth is acceptable but not ideal.');
  } else {
    reasons.push('Pullback depth is outside preferred range.');
  }

  if (stochasticK >= 20 && stochasticK <= 45) {
    stochasticScore = 20;
    reasons.push('Stochastic is in reset/turn zone.');
  } else if (stochasticK > 45 && stochasticK <= 60) {
    stochasticScore = 10;
    reasons.push('Stochastic is improving but not fully reset.');
  } else {
    reasons.push('Stochastic has not reset to preferred zone.');
  }

  if (relativeVolume >= 1.0) {
    volumeScore = 20;
    reasons.push('Volume confirms setup vs baseline.');
  } else if (relativeVolume >= 0.8) {
    volumeScore = 10;
    reasons.push('Volume is acceptable but not strong.');
  } else {
    reasons.push('Volume is below confirmation threshold.');
  }

  const entryPrice = latestClose;
  const stopLoss = Math.min(latestLow, sma20 * 0.99);
  const risk = entryPrice - stopLoss;
  const targetPrice = entryPrice + risk * 2;
  const riskReward = risk > 0 ? (targetPrice - entryPrice) / risk : null;
  const riskPercent = entryPrice > 0 ? risk / entryPrice : 0;
  if (
    riskReward !== null &&
    riskReward >= 1.5 &&
    riskPercent >= 0.005 &&
    riskPercent <= 0.025
  ) {
    riskRewardScore = 15;
    reasons.push('Risk profile is tight with strong reward potential.');
  } else if (
    riskReward !== null &&
    riskReward >= 1.5 &&
    riskPercent > 0 &&
    riskPercent <= 0.04
  ) {
    riskRewardScore = 8;
    reasons.push('Risk profile is acceptable but wider than ideal.');
  } else {
    reasons.push('Stop distance is too wide for preferred risk profile.');
  }

  const totalScore = Math.min(
    100,
    trendScore + pullbackScore + stochasticScore + volumeScore + riskRewardScore,
  );
  const scannerScore: ScannerScore = {
    totalScore,
    grade: gradeFromScore(totalScore),
    components: {
      trend: trendScore,
      pullback: pullbackScore,
      stochastic: stochasticScore,
      volume: volumeScore,
      riskReward: riskRewardScore,
    },
  };
  const isValid = scannerScore.grade === 'STRONG';
  const lastReason = isValid
    ? 'Trend pullback setup qualifies.'
    : 'Trend pullback setup does not qualify.';

  return {
    isValid,
    confidence: totalScore,
    entryPrice,
    stopLoss,
    targetPrice,
    riskReward,
    reason: `${lastReason} ${reasons.join(' ')}`.trim(),
    reasons,
    scannerScore,
    timeHorizon: '3-10 trading days',
  };
}
