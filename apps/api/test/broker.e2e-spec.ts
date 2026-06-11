import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AlpacaBrokerReadAdapter } from '../src/modules/broker/adapters/alpaca-broker-read.adapter';

describe('BrokerController (e2e)', () => {
  let app: INestApplication<App>;
  const originalProvider = process.env.BROKER_READ_PROVIDER;

  const mockAdapter: Pick<
    AlpacaBrokerReadAdapter,
    'getAccountSnapshot' | 'listOpenPositions'
  > = {
    getAccountSnapshot: jest.fn().mockResolvedValue({
      equity: 102500,
      cash: 40000,
      buyingPower: 205000,
      portfolioValue: 62500,
      lastEquity: 100000,
      dayChange: 2500,
      dayChangePercent: 0.025,
      currency: 'USD',
    }),
    listOpenPositions: jest.fn().mockResolvedValue([
      {
        symbol: 'MSFT',
        quantity: 5,
        averageCost: 400,
        marketValue: 2100,
        unrealizedPnl: 100,
        currentPrice: 420,
      },
    ]),
  };

  beforeAll(async () => {
    process.env.BROKER_READ_PROVIDER = 'alpaca';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AlpacaBrokerReadAdapter)
      .useValue(mockAdapter)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    process.env.BROKER_READ_PROVIDER = originalProvider;
    if (app) {
      await app.close();
    }
  });

  it('returns normalized broker snapshot', async () => {
    const response = await request(app.getHttpServer())
      .get('/broker/snapshot')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.provider).toBe('alpaca');
    expect(response.body.account.equity).toBe(102500);
    expect(response.body.account.dayChange).toBe(2500);
    expect(response.body.positions).toHaveLength(1);
    expect(response.body.positions[0].symbol).toBe('MSFT');
  });

  it('returns broker health', async () => {
    const response = await request(app.getHttpServer())
      .get('/broker/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.provider).toBe('alpaca');
  });

  it('returns 503 when broker read provider is disabled', async () => {
    process.env.BROKER_READ_PROVIDER = 'disabled';

    const response = await request(app.getHttpServer())
      .get('/broker/snapshot')
      .expect(503);

    expect(response.body.message).toContain('disabled');

    process.env.BROKER_READ_PROVIDER = 'alpaca';
  });
});
