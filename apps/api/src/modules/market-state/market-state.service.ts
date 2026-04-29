import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  BreadthState,
  ExtensionState,
  MarketState,
  MarketStateResponse,
  MarketTrend,
  VolatilityRegime,
} from './market-state.types';

type TrendSnapshot = {
  trend: MarketTrend;
  extension: ExtensionState;
};

type VolatilitySource = 'VIX' | '^VIX' | 'VXX' | 'VIXY' | 'NONE';

@Injectable()
export class MarketStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getLatestMarketState(): Promise<MarketStateResponse> {
    const [spyBars, qqqBars, breadthData] = await Promise.all([
      this.getSymbolCloses('SPY', 50),
      this.getSymbolCloses('QQQ', 50),
      this.getCoreBreadthInput(),
    ]);
    const volatilityInput = await this.getVolatilityInput();

    const spyTrend = this.classifyTrend(spyBars);
    const qqqTrend = this.classifyTrend(qqqBars);
    const volatilityRegime = this.classifyVolatilityRegime(volatilityInput);
    const breadthState = this.classifyBreadthState(breadthData);

    const conditions: string[] = [
      this.trendCondition(spyTrend.trend, qqqTrend.trend),
      this.breadthCondition(breadthState),
    ];
    if (volatilityInput.source === 'NONE') {
      conditions.push('VIX data unavailable');
    } else if (
      volatilityInput.source === 'VXX' ||
      volatilityInput.source === 'VIXY'
    ) {
      conditions.push(`Using ${volatilityInput.source} volatility proxy`);
    }
    if (volatilityRegime === 'ELEVATED') {
      conditions.push('Volatility is elevated');
    } else if (volatilityRegime === 'UNKNOWN') {
      conditions.push('Volatility regime is unknown');
    } else {
      conditions.push('Volatility is not elevated');
    }

    const state = this.classifyMarketState({
      spyTrend,
      qqqTrend,
      volatilityRegime,
      breadthState,
    });

    return this.toResponse(state, volatilityRegime, breadthState, conditions);
  }

  private async getSymbolCloses(
    symbol: string,
    take: number,
  ): Promise<number[]> {
    const rows = await this.prisma.dailyPrice.findMany({
      where: { symbol: { ticker: symbol } },
      orderBy: { date: 'desc' },
      take,
      select: { close: true },
    });
    return rows.map((row) => Number(row.close)).reverse();
  }

  private async getCoreBreadthInput(): Promise<Array<{ close: number[] }>> {
    const rows = await this.prisma.symbol.findMany({
      where: {
        isActive: true,
        universeType: 'CORE',
        ticker: { notIn: ['VIX'] },
      },
      select: {
        dailyPrices: {
          orderBy: { date: 'desc' },
          take: 20,
          select: { close: true },
        },
      },
    });
    return rows.map((row) => ({
      close: row.dailyPrices.map((bar) => Number(bar.close)).reverse(),
    }));
  }

  private classifyTrend(closes: number[]): TrendSnapshot {
    const latest = closes.at(-1);
    const sma20 = this.sma(closes, 20);
    const sma50 = this.sma(closes, 50);

    if (
      latest === null ||
      latest === undefined ||
      sma20 === null ||
      sma50 === null
    ) {
      return {
        trend: 'NEUTRAL',
        extension: 'NEUTRAL',
      };
    }

    let trend: MarketTrend = 'NEUTRAL';
    if (latest > sma20 && latest > sma50 && sma20 > sma50) {
      trend = 'BULLISH';
    } else if (latest < sma50 && sma20 < sma50) {
      trend = 'BEARISH';
    }

    const distanceFromSma20 = (latest - sma20) / sma20;
    let extension: ExtensionState = 'NEUTRAL';
    if (distanceFromSma20 > 0.03) {
      extension = 'EXTENDED';
    } else if (latest < sma20) {
      extension = 'PULLBACK';
    }

    return { trend, extension };
  }

  private async getVolatilityInput(): Promise<{
    source: VolatilitySource;
    value: number | null;
  }> {
    const preferredTickers: VolatilitySource[] = ['VIX', '^VIX', 'VXX', 'VIXY'];
    for (const ticker of preferredTickers) {
      const closes = await this.getSymbolCloses(ticker, 1);
      const value = closes.at(-1);
      if (value !== null && value !== undefined) {
        return { source: ticker, value };
      }
    }
    return { source: 'NONE', value: null };
  }

  private classifyVolatilityRegime(volatilityInput: {
    source: VolatilitySource;
    value: number | null;
  }): VolatilityRegime {
    const { source, value } = volatilityInput;
    if (value === null) {
      return 'UNKNOWN';
    }

    if (source === 'VIX' || source === '^VIX') {
      if (value < 15) {
        return 'CALM';
      }
      if (value <= 20) {
        return 'NORMAL';
      }
      return 'ELEVATED';
    }

    if (value < 20) {
      return 'CALM';
    }
    if (value <= 30) {
      return 'NORMAL';
    }
    return 'ELEVATED';
  }

  private classifyBreadthState(rows: Array<{ close: number[] }>): BreadthState {
    const eligible = rows.filter((row) => row.close.length >= 20);
    if (eligible.length === 0) {
      return 'MIXED';
    }

    const above20SmaCount = eligible.filter((row) => {
      const latest = row.close.at(-1);
      const sma20 = this.sma(row.close, 20);
      if (latest === null || latest === undefined || sma20 === null) {
        return false;
      }
      return latest > sma20;
    }).length;

    const participation = (above20SmaCount / eligible.length) * 100;
    if (participation >= 70) {
      return 'STRONG';
    }
    if (participation >= 40) {
      return 'MIXED';
    }
    return 'WEAK';
  }

  private classifyMarketState(params: {
    spyTrend: TrendSnapshot;
    qqqTrend: TrendSnapshot;
    volatilityRegime: VolatilityRegime;
    breadthState: BreadthState;
  }): MarketState {
    const { spyTrend, qqqTrend, volatilityRegime, breadthState } = params;
    const vixNotElevated =
      volatilityRegime === 'CALM' ||
      volatilityRegime === 'NORMAL' ||
      volatilityRegime === 'UNKNOWN';

    if (
      spyTrend.trend === 'BULLISH' &&
      qqqTrend.trend === 'BULLISH' &&
      breadthState === 'STRONG' &&
      volatilityRegime !== 'ELEVATED'
    ) {
      return 'TRENDING_BULL';
    }

    if (
      (spyTrend.extension === 'PULLBACK' ||
        qqqTrend.extension === 'PULLBACK') &&
      (breadthState === 'MIXED' || breadthState === 'STRONG') &&
      vixNotElevated
    ) {
      return 'PULLBACK_RESET';
    }

    if (
      spyTrend.trend === 'BEARISH' &&
      (qqqTrend.trend === 'BEARISH' || breadthState === 'WEAK') &&
      (volatilityRegime === 'ELEVATED' || breadthState === 'WEAK')
    ) {
      return 'BEARISH_WEAK';
    }

    return 'CHOPPY_MIXED';
  }

  private toResponse(
    state: MarketState,
    volatilityRegime: VolatilityRegime,
    breadthState: BreadthState,
    conditions: string[],
  ): MarketStateResponse {
    if (state === 'TRENDING_BULL') {
      return {
        state,
        label: 'Trending Bull Market',
        summary:
          'Market is in a broad uptrend. Breakout setups are generally more favorable than deep mean-reversion entries.',
        conditions,
        strategyGuidance: {
          trendPullback: 'NEUTRAL',
          relativeStrengthBreakout: 'FAVORABLE',
          oversoldBounce: 'UNFAVORABLE',
        },
        volatilityRegime,
        breadthState,
      };
    }

    if (state === 'PULLBACK_RESET') {
      return {
        state,
        label: 'Pullback Reset Environment',
        summary:
          'Market trend structure is still constructive but currently in a pullback/reset phase where selective entries can improve.',
        conditions,
        strategyGuidance: {
          trendPullback: 'FAVORABLE',
          relativeStrengthBreakout: 'NEUTRAL',
          oversoldBounce: 'NEUTRAL',
        },
        volatilityRegime,
        breadthState,
      };
    }

    if (state === 'BEARISH_WEAK') {
      return {
        state,
        label: 'Bearish / Weak Environment',
        summary:
          'Market internals are risk-off. Defensive posture and smaller risk-taking are generally more appropriate.',
        conditions,
        strategyGuidance: {
          trendPullback: 'UNFAVORABLE',
          relativeStrengthBreakout: 'UNFAVORABLE',
          oversoldBounce: 'FAVORABLE',
        },
        volatilityRegime,
        breadthState,
      };
    }

    return {
      state,
      label: 'Choppy / Mixed Market',
      summary:
        'Market conditions are mixed without clear directional agreement. Prefer selective setups and tighter risk controls.',
      conditions,
      strategyGuidance: {
        trendPullback: 'NEUTRAL',
        relativeStrengthBreakout: 'NEUTRAL',
        oversoldBounce: 'NEUTRAL',
      },
      volatilityRegime,
      breadthState,
    };
  }

  private trendCondition(spyTrend: MarketTrend, qqqTrend: MarketTrend): string {
    if (spyTrend === 'BULLISH' && qqqTrend === 'BULLISH') {
      return 'SPY and QQQ are trending above key moving averages';
    }
    if (spyTrend === 'BEARISH' && qqqTrend === 'BEARISH') {
      return 'SPY and QQQ are both in bearish trend structure';
    }
    return 'SPY and QQQ trend structure is mixed';
  }

  private breadthCondition(breadthState: BreadthState): string {
    if (breadthState === 'STRONG') {
      return 'Most core symbols are participating in the trend';
    }
    if (breadthState === 'WEAK') {
      return 'Only a small share of core symbols are participating';
    }
    return 'Core symbol participation is mixed';
  }

  private sma(values: number[], period: number): number | null {
    if (values.length < period) {
      return null;
    }
    const window = values.slice(values.length - period);
    const sum = window.reduce((acc, current) => acc + current, 0);
    return sum / period;
  }
}
