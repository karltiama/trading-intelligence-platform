import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AlpacaBrokerWriteAdapter } from './adapters/alpaca-broker-write.adapter';
import {
  resolveBrokerWriteProvider,
  type BrokerWriteProvider,
} from './broker-write.config';
import type {
  BrokerMarketOrderRequest,
  BrokerOrderSubmission,
} from './ports/broker-write.port';

@Injectable()
export class BrokerWriteService {
  constructor(private readonly alpacaAdapter: AlpacaBrokerWriteAdapter) {}

  getProvider(): BrokerWriteProvider {
    return resolveBrokerWriteProvider();
  }

  isEnabled(): boolean {
    return this.getProvider() === 'alpaca';
  }

  async submitMarketOrder(
    request: BrokerMarketOrderRequest,
  ): Promise<BrokerOrderSubmission> {
    this.assertEnabled();
    return this.alpacaAdapter.submitMarketOrder(request);
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    this.assertEnabled();
    await this.alpacaAdapter.cancelOrder(brokerOrderId);
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Broker order routing is disabled. Set BROKER_WRITE_PROVIDER=alpaca to route orders to Alpaca.',
      );
    }
  }
}

export function assertBrokerFillPrice(
  submission: BrokerOrderSubmission,
): number {
  if (submission.filledAvgPrice === null || submission.filledAvgPrice <= 0) {
    throw new BadRequestException(
      `Alpaca order ${submission.brokerOrderId} did not return a fill price.`,
    );
  }
  return submission.filledAvgPrice;
}
