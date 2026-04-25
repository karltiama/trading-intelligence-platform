import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AlpacaClient } from '../src/modules/market-data/alpaca.client';
import { PrismaService } from '../src/prisma/prisma.service';

describe('MarketDataController idempotency (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ticker: string;
  const syncApiKey = 'test-sync-key';
  const syncApiKeyHeader = 'x-sync-api-key';
  const previousSyncApiKey = process.env.SYNC_API_KEY;
  const getDailyBarsMock = jest.fn();

  beforeAll(async () => {
    process.env.SYNC_API_KEY = syncApiKey;

    const alpacaStub: Pick<AlpacaClient, 'getDailyBars'> = {
      getDailyBars: getDailyBarsMock.mockImplementation(
        async (symbol: string) => {
          if (symbol === 'ERRSYNC') {
            throw new Error('alpaca unavailable for test');
          }

          return [
            {
              symbol: 'AAPL',
              open: 100,
              high: 110,
              low: 95,
              close: 105,
              volume: 1000,
              timestamp: '2026-04-23T00:00:00Z',
            },
            {
              symbol: 'AAPL',
              open: 106,
              high: 112,
              low: 101,
              close: 108,
              volume: 900,
              timestamp: '2026-04-24T00:00:00Z',
            },
          ];
        },
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AlpacaClient)
      .useValue(alpacaStub)
      .compile();

    app = moduleRef.createNestApplication();
    prisma = moduleRef.get(PrismaService);
    await app.init();
  });

  it('rejects sync requests without API key header', async () => {
    await request(app.getHttpServer())
      .post('/market-data/sync/AAPL?limit=2')
      .expect(401);
  });

  it('rejects sync requests with limit above allowed maximum', async () => {
    await request(app.getHttpServer())
      .post('/market-data/sync/AAPL?limit=501')
      .set(syncApiKeyHeader, syncApiKey)
      .expect(400);
  });

  it('returns standardized error payload on sync provider failure', async () => {
    const response = await request(app.getHttpServer())
      .post('/market-data/sync/ERRSYNC?limit=2')
      .set(syncApiKeyHeader, syncApiKey)
      .expect(502);

    expect(response.body.code).toBe('SYNC_UPSTREAM_ERROR');
    expect(response.body.message).toBe(
      'Market data sync failed due to upstream provider error.',
    );
    expect(response.body.details).toEqual({
      errorName: 'Error',
      errorMessage: 'alpaca unavailable for test',
    });
  });

  it('keeps one DailyPrice row per date after repeated sync endpoint calls', async () => {
    ticker = `CTRL_IDEMP_${Date.now()}`;

    await request(app.getHttpServer())
      .post(`/market-data/sync/${ticker}?limit=2`)
      .set(syncApiKeyHeader, syncApiKey)
      .expect(201)
      .expect({ symbol: ticker, barsUpserted: 2 });

    await request(app.getHttpServer())
      .post(`/market-data/sync/${ticker}?limit=2`)
      .set(syncApiKeyHeader, syncApiKey)
      .expect(201)
      .expect({ symbol: ticker, barsUpserted: 2 });

    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });

    expect(symbol).not.toBeNull();
    if (!symbol) {
      return;
    }

    const prices = await prisma.dailyPrice.findMany({
      where: { symbolId: symbol.id },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        open: true,
        close: true,
      },
    });

    expect(prices).toHaveLength(2);
    expect(prices[0].date.toISOString()).toBe('2026-04-23T00:00:00.000Z');
    expect(prices[1].date.toISOString()).toBe('2026-04-24T00:00:00.000Z');
    expect(prices[0].open).toEqual(new Prisma.Decimal(100));
    expect(prices[1].close).toEqual(new Prisma.Decimal(108));
  });

  afterAll(async () => {
    if (ticker) {
      const symbol = await prisma.symbol.findUnique({
        where: { ticker },
        select: { id: true },
      });

      if (symbol) {
        await prisma.dailyPrice.deleteMany({ where: { symbolId: symbol.id } });
        await prisma.symbol.delete({ where: { id: symbol.id } });
      }
    }

    await app.close();
    process.env.SYNC_API_KEY = previousSyncApiKey;
  });
});
