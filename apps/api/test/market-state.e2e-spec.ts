import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('MarketStateController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let coreTickers: string[] = [];
  const seededDate = new Date('2026-04-29T00:00:00.000Z');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    coreTickers = [
      `MKT${Date.now()}A`,
      `MKT${Date.now()}B`,
      `MKT${Date.now()}C`,
    ];
    await seedSymbolWithPrice('SPY', 500, 'CORE');
    await seedSymbolWithPrice('QQQ', 420, 'CORE');
    await seedSymbolWithPrice('VIX', 16, 'ON_DEMAND');
    for (const [index, ticker] of coreTickers.entries()) {
      await seedSymbolWithPrice(ticker, 100 + index, 'CORE');
    }
  });

  it('GET /market-state returns valid qualitative shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/market-state')
      .expect(200);

    const body = res.body as {
      state?: unknown;
      label?: unknown;
      summary?: unknown;
      conditions?: unknown;
      strategyGuidance?: {
        trendPullback?: unknown;
        relativeStrengthBreakout?: unknown;
        oversoldBounce?: unknown;
      };
      volatilityRegime?: unknown;
      breadthState?: unknown;
      sma20?: unknown;
      sma50?: unknown;
      breadthPercent?: unknown;
      vixValue?: unknown;
    };
    expect(typeof body.state).toBe('string');
    expect(typeof body.label).toBe('string');
    expect(typeof body.summary).toBe('string');
    expect(Array.isArray(body.conditions)).toBe(true);
    expect(typeof body.strategyGuidance?.trendPullback).toBe('string');
    expect(typeof body.strategyGuidance?.relativeStrengthBreakout).toBe(
      'string',
    );
    expect(typeof body.strategyGuidance?.oversoldBounce).toBe('string');
    expect(typeof body.volatilityRegime).toBe('string');
    expect(typeof body.breadthState).toBe('string');
    expect(body.sma20).toBeUndefined();
    expect(body.sma50).toBeUndefined();
    expect(body.breadthPercent).toBeUndefined();
    expect(body.vixValue).toBeUndefined();
  });

  afterEach(async () => {
    await prisma.dailyPrice.deleteMany({
      where: {
        OR: [
          { symbol: { ticker: { in: coreTickers } }, date: seededDate },
          { symbol: { ticker: 'SPY' }, date: seededDate },
          { symbol: { ticker: 'QQQ' }, date: seededDate },
          { symbol: { ticker: 'VIX' }, date: seededDate },
        ],
      },
    });
    await prisma.symbol.deleteMany({ where: { ticker: { in: coreTickers } } });
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedSymbolWithPrice(
    ticker: string,
    close: number,
    universeType: 'CORE' | 'ON_DEMAND',
  ) {
    const symbol = await prisma.symbol.upsert({
      where: { ticker },
      create: { ticker, isActive: true, universeType },
      update: { isActive: true, universeType },
      select: { id: true },
    });

    await prisma.dailyPrice.upsert({
      where: {
        symbolId_date: {
          symbolId: symbol.id,
          date: seededDate,
        },
      },
      create: {
        symbolId: symbol.id,
        date: seededDate,
        open: new Prisma.Decimal(close),
        high: new Prisma.Decimal(close),
        low: new Prisma.Decimal(close),
        close: new Prisma.Decimal(close),
        volume: new Prisma.Decimal(1000000),
        source: 'e2e',
      },
      update: {
        open: new Prisma.Decimal(close),
        high: new Prisma.Decimal(close),
        low: new Prisma.Decimal(close),
        close: new Prisma.Decimal(close),
        volume: new Prisma.Decimal(1000000),
        source: 'e2e',
      },
    });
  }
});
