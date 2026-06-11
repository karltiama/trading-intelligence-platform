import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AlpacaBrokerReadAdapter } from './adapters/alpaca-broker-read.adapter';
import type {
  BrokerHealth,
  BrokerSnapshot,
} from './dto/broker-snapshot.dto';

export type BrokerReadProvider = 'alpaca' | 'disabled';

const CACHE_TTL_MS = 30_000;

type CachedSnapshot = {
  expiresAtMs: number;
  snapshot: BrokerSnapshot;
};

@Injectable()
export class BrokerReadService {
  private cache: CachedSnapshot | null = null;

  constructor(private readonly alpacaAdapter: AlpacaBrokerReadAdapter) {}

  getProvider(): BrokerReadProvider {
    return this.resolveProvider();
  }

  isEnabled(): boolean {
    return this.resolveProvider() === 'alpaca';
  }

  async getSnapshot(): Promise<BrokerSnapshot> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Broker read sync is disabled. Set BROKER_READ_PROVIDER=alpaca to enable Alpaca paper account sync.',
      );
    }

    const nowMs = Date.now();
    if (this.cache && this.cache.expiresAtMs > nowMs) {
      return this.cache.snapshot;
    }

    const snapshot = await this.fetchSnapshot();
    this.cache = {
      expiresAtMs: nowMs + CACHE_TTL_MS,
      snapshot,
    };
    return snapshot;
  }

  async getHealth(): Promise<BrokerHealth> {
    const provider = this.resolveProvider();
    const asOf = new Date().toISOString();

    if (provider === 'disabled') {
      return {
        provider: 'disabled',
        status: 'disabled',
        asOf,
        message:
          'Broker read sync is disabled. Set BROKER_READ_PROVIDER=alpaca to enable.',
      };
    }

    try {
      await this.alpacaAdapter.getAccountSnapshot();
      return {
        provider: 'alpaca',
        status: 'ok',
        asOf,
      };
    } catch (error) {
      return {
        provider: 'alpaca',
        status: 'error',
        asOf,
        message:
          error instanceof Error ? error.message : 'Broker health check failed.',
      };
    }
  }

  clearCache(): void {
    this.cache = null;
  }

  private resolveProvider(): BrokerReadProvider {
    const raw = process.env.BROKER_READ_PROVIDER?.trim().toLowerCase();
    if (!raw || raw === 'disabled') {
      return 'disabled';
    }
    if (raw === 'alpaca') {
      return 'alpaca';
    }
    return 'disabled';
  }

  private async fetchSnapshot(): Promise<BrokerSnapshot> {
    const asOf = new Date().toISOString();

    try {
      const [account, positions] = await Promise.all([
        this.alpacaAdapter.getAccountSnapshot(),
        this.alpacaAdapter.listOpenPositions(),
      ]);

      return {
        provider: 'alpaca',
        status: 'ok',
        asOf,
        account,
        positions,
      };
    } catch (error) {
      return {
        provider: 'alpaca',
        status: 'error',
        asOf,
        account: this.emptyAccount(),
        positions: [],
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load Alpaca broker snapshot.',
      };
    }
  }

  private emptyAccount(): BrokerSnapshot['account'] {
    return {
      equity: 0,
      cash: 0,
      buyingPower: 0,
      portfolioValue: 0,
      lastEquity: 0,
      dayChange: 0,
      dayChangePercent: 0,
      currency: 'USD',
    };
  }
}
