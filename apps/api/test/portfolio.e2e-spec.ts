import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('PortfolioController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ticker: string;
  const userEmail = 'portfolio-strict@local.test';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    ticker = `PFL${Date.now()}`;
    const symbol = await prisma.symbol.create({
      data: { ticker, isActive: true },
      select: { id: true },
    });

    await prisma.dailyPrice.create({
      data: {
        symbolId: symbol.id,
        date: new Date('2026-04-25T00:00:00.000Z'),
        open: new Prisma.Decimal(100),
        high: new Prisma.Decimal(100),
        low: new Prisma.Decimal(100),
        close: new Prisma.Decimal(100),
        volume: new Prisma.Decimal(1000000),
        source: 'alpaca',
      },
    });
  });

  it('returns positions and summary after market buy order', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 2,
        stopLossPrice: 95,
      })
      .expect(201);

    const positions = await request(app.getHttpServer())
      .get('/portfolio/positions')
      .set('x-user-email', userEmail)
      .expect(200);

    expect(Array.isArray(positions.body)).toBe(true);
    const position = positions.body.find(
      (row: { symbol: string }) => row.symbol === ticker,
    );
    expect(position).toBeDefined();
    expect(position.userEmail).toBe(userEmail);
    expect(position.quantity).toBe(2);
    expect(position.averageCost).toBe(100);
    expect(position.currentPrice).toBe(100);
    expect(position.marketValue).toBe(200);
    expect(position.unrealizedPnl).toBe(0);
    expect(position.realizedPnl).toBe(0);
    expect(position.asOf).toBe('2026-04-25T00:00:00.000Z');
    expect(position.priceSource).toBe('D1');

    const summary = await request(app.getHttpServer())
      .get('/portfolio/summary')
      .set('x-user-email', userEmail)
      .expect(200);
    expect(summary.body.currency).toBe('USD');
    expect(summary.body.userEmail).toBe(userEmail);
    expect(summary.body.positionsValue).toBeGreaterThanOrEqual(200);
    expect(summary.body.totalEquity).toBe(
      summary.body.cashBalance + summary.body.positionsValue,
    );
    expect(summary.body.realizedPnl).toBeGreaterThanOrEqual(0);
    expect(summary.body.asOf).toBe('2026-04-25T00:00:00.000Z');
  });

  it('updates realized pnl after buy then partial sell', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 2,
        stopLossPrice: 95,
      })
      .expect(201);

    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });
    if (!symbol) {
      throw new Error('Expected seeded symbol to exist.');
    }

    await prisma.dailyPrice.create({
      data: {
        symbolId: symbol.id,
        date: new Date('2026-04-26T00:00:00.000Z'),
        open: new Prisma.Decimal(120),
        high: new Prisma.Decimal(120),
        low: new Prisma.Decimal(120),
        close: new Prisma.Decimal(120),
        volume: new Prisma.Decimal(1000000),
        source: 'alpaca',
      },
    });

    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'SELL',
        quantity: 1,
      })
      .expect(201);

    const positions = await request(app.getHttpServer())
      .get('/portfolio/positions')
      .set('x-user-email', userEmail)
      .expect(200);

    const position = positions.body.find(
      (row: { symbol: string }) => row.symbol === ticker,
    );
    expect(position).toBeDefined();
    expect(position.userEmail).toBe(userEmail);
    expect(position.quantity).toBe(1);
    expect(position.averageCost).toBe(100);
    expect(position.currentPrice).toBe(120);
    expect(position.unrealizedPnl).toBe(20);
    expect(position.realizedPnl).toBe(20);
    expect(position.asOf).toBe('2026-04-26T00:00:00.000Z');
    expect(position.priceSource).toBe('D1');

    const summary = await request(app.getHttpServer())
      .get('/portfolio/summary')
      .set('x-user-email', userEmail)
      .expect(200);
    expect(summary.body.userEmail).toBe(userEmail);
    expect(summary.body.realizedPnl).toBeGreaterThanOrEqual(20);
    expect(summary.body.totalEquity).toBe(
      summary.body.cashBalance + summary.body.positionsValue,
    );
    expect(summary.body.asOf).toBe('2026-04-26T00:00:00.000Z');
  });

  it('returns combined portfolio view and records a daily snapshot', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 2,
        stopLossPrice: 95,
      })
      .expect(201);

    const portfolio = await request(app.getHttpServer())
      .get('/portfolio')
      .set('x-user-email', userEmail)
      .expect(200);

    expect(portfolio.body.summary).toBeDefined();
    expect(Array.isArray(portfolio.body.positions)).toBe(true);
    expect(portfolio.body.summary.positionCount).toBe(1);
    expect(portfolio.body.summary.startingCash).toBeGreaterThan(0);
    expect(portfolio.body.summary.totalReturn).toBeDefined();
    expect(portfolio.body.summary.cashPct).not.toBeNull();
    expect(portfolio.body.summary.investedPct).not.toBeNull();
    expect(portfolio.body.summary.positionsWithoutStop).toBe(0);

    const position = portfolio.body.positions.find(
      (row: { symbol: string }) => row.symbol === ticker,
    );
    expect(position).toBeDefined();
    expect(position.costBasis).toBe(200);
    expect(position.weightPct).not.toBeNull();

    const history = await request(app.getHttpServer())
      .get('/portfolio/history?limit=5')
      .set('x-user-email', userEmail)
      .expect(200);

    expect(Array.isArray(history.body)).toBe(true);
    expect(history.body.length).toBeGreaterThanOrEqual(1);
    expect(history.body[0].totalEquity).toBe(portfolio.body.summary.totalEquity);
  });

  it('rejects portfolio summary without user context', async () => {
    await request(app.getHttpServer()).get('/portfolio/summary').expect(400);
  });

  it('returns not found for foreign explicit account selection', async () => {
    const foreignUser = await prisma.user.create({
      data: {
        email: `portfolio-foreign-${Date.now()}@local.test`,
        displayName: 'Portfolio Foreign',
      },
      select: { id: true },
    });
    const foreignAccount = await prisma.paperAccount.create({
      data: {
        userId: foreignUser.id,
        startingCash: new Prisma.Decimal(100000),
        cashBalance: new Prisma.Decimal(100000),
        currency: 'USD',
      },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .get(`/portfolio/summary?accountId=${foreignAccount.id}`)
      .set('x-user-email', userEmail)
      .expect(404);

    await prisma.paperAccount.deleteMany({ where: { id: foreignAccount.id } });
    await prisma.user.deleteMany({ where: { id: foreignUser.id } });
  });

  afterEach(async () => {
    if (!prisma) {
      return;
    }
    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });

    if (symbol) {
      await prisma.paperFill.deleteMany({ where: { symbolId: symbol.id } });
      await prisma.paperOrder.deleteMany({ where: { symbolId: symbol.id } });
      await prisma.paperPosition.deleteMany({ where: { symbolId: symbol.id } });
    }

    await prisma.dailyPrice.deleteMany({
      where: {
        symbol: { ticker },
      },
    });
    await prisma.symbol.deleteMany({ where: { ticker } });

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    });
    if (user) {
      const accounts = await prisma.paperAccount.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      for (const account of accounts) {
        await prisma.paperAccountSnapshot.deleteMany({
          where: { accountId: account.id },
        });
      }
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});
