import { ServiceUnavailableException } from '@nestjs/common';
import { AlpacaBrokerReadAdapter } from './adapters/alpaca-broker-read.adapter';
import { BrokerReadService } from './broker-read.service';

describe('BrokerReadService', () => {
  const adapter = {
    getAccountSnapshot: jest.fn(),
    listOpenPositions: jest.fn(),
  } as unknown as AlpacaBrokerReadAdapter;

  const originalProvider = process.env.BROKER_READ_PROVIDER;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BROKER_READ_PROVIDER = 'alpaca';
    (adapter.getAccountSnapshot as jest.Mock).mockResolvedValue({
      equity: 100000,
      cash: 50000,
      buyingPower: 200000,
      portfolioValue: 50000,
      lastEquity: 99000,
      dayChange: 1000,
      dayChangePercent: 1000 / 99000,
      currency: 'USD',
    });
    (adapter.listOpenPositions as jest.Mock).mockResolvedValue([
      {
        symbol: 'AAPL',
        quantity: 1,
        averageCost: 100,
        marketValue: 110,
        unrealizedPnl: 10,
        currentPrice: 110,
      },
    ]);
  });

  afterEach(() => {
    process.env.BROKER_READ_PROVIDER = originalProvider;
  });

  it('returns disabled health when provider is disabled', async () => {
    process.env.BROKER_READ_PROVIDER = 'disabled';
    const service = new BrokerReadService(adapter);

    const health = await service.getHealth();

    expect(health.status).toBe('disabled');
    expect(health.provider).toBe('disabled');
  });

  it('throws 503 when snapshot requested while disabled', async () => {
    process.env.BROKER_READ_PROVIDER = 'disabled';
    const service = new BrokerReadService(adapter);

    await expect(service.getSnapshot()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns combined snapshot from adapter', async () => {
    const service = new BrokerReadService(adapter);

    const snapshot = await service.getSnapshot();

    expect(snapshot.status).toBe('ok');
    expect(snapshot.provider).toBe('alpaca');
    expect(snapshot.account.equity).toBe(100000);
    expect(snapshot.positions).toHaveLength(1);
    expect(adapter.getAccountSnapshot).toHaveBeenCalledTimes(1);
    expect(adapter.listOpenPositions).toHaveBeenCalledTimes(1);
  });

  it('returns empty positions when adapter returns none', async () => {
    (adapter.listOpenPositions as jest.Mock).mockResolvedValue([]);
    const service = new BrokerReadService(adapter);

    const snapshot = await service.getSnapshot();

    expect(snapshot.positions).toEqual([]);
  });

  it('caches snapshot for 30 seconds', async () => {
    const service = new BrokerReadService(adapter);

    await service.getSnapshot();
    await service.getSnapshot();

    expect(adapter.getAccountSnapshot).toHaveBeenCalledTimes(1);
    expect(adapter.listOpenPositions).toHaveBeenCalledTimes(1);
  });

  it('returns error snapshot when adapter fails', async () => {
    (adapter.getAccountSnapshot as jest.Mock).mockRejectedValue(
      new Error('Alpaca unavailable'),
    );
    const service = new BrokerReadService(adapter);

    const snapshot = await service.getSnapshot();

    expect(snapshot.status).toBe('error');
    expect(snapshot.positions).toEqual([]);
    expect(snapshot.message).toContain('Alpaca unavailable');
  });
});
