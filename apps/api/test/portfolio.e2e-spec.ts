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
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 2,
      })
      .expect(201);

    const positions = await request(app.getHttpServer())
      .get('/portfolio/positions')
      .expect(200);

    expect(Array.isArray(positions.body)).toBe(true);
    const position = positions.body.find(
      (row: { symbol: string }) => row.symbol === ticker,
    );
    expect(position).toBeDefined();
    expect(position.quantity).toBe(2);
    expect(position.averageCost).toBe(100);
    expect(position.currentPrice).toBe(100);
    expect(position.marketValue).toBe(200);
    expect(position.unrealizedPnl).toBe(0);
    expect(position.realizedPnl).toBe(0);
    expect(position.asOf).toBe('2026-04-25T00:00:00.000Z');

    const summary = await request(app.getHttpServer())
      .get('/portfolio/summary')
      .expect(200);
    expect(summary.body.currency).toBe('USD');
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
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 2,
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
      .send({
        symbol: ticker,
        side: 'SELL',
        quantity: 1,
      })
      .expect(201);

    const positions = await request(app.getHttpServer())
      .get('/portfolio/positions')
      .expect(200);

    const position = positions.body.find(
      (row: { symbol: string }) => row.symbol === ticker,
    );
    expect(position).toBeDefined();
    expect(position.quantity).toBe(1);
    expect(position.averageCost).toBe(100);
    expect(position.currentPrice).toBe(120);
    expect(position.unrealizedPnl).toBe(20);
    expect(position.realizedPnl).toBe(20);
    expect(position.asOf).toBe('2026-04-26T00:00:00.000Z');

    const summary = await request(app.getHttpServer())
      .get('/portfolio/summary')
      .expect(200);
    expect(summary.body.realizedPnl).toBeGreaterThanOrEqual(20);
    expect(summary.body.totalEquity).toBe(
      summary.body.cashBalance + summary.body.positionsValue,
    );
    expect(summary.body.asOf).toBe('2026-04-26T00:00:00.000Z');
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});
